import json
import asyncio
import threading
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.schemas import AgentRequest, AgentResponse
from app.agent import maxex_graph, AgentState
from app.parser import parse_markup

router = APIRouter(prefix="/api/v1", tags=["maxex-agent"])


def _resolve_loan_data(request: AgentRequest) -> dict:
    if request.raw_input is not None:
        try:
            return parse_markup(request.raw_input, request.format)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Failed to parse {request.format.upper()}: {exc}")
    if request.loan_data is not None:
        return request.loan_data
    raise HTTPException(status_code=422, detail="Provide either loan_data or raw_input")


def _build_state(loan_data: dict, request: AgentRequest) -> AgentState:
    return {
        "loan_data": loan_data,
        "schema_type": request.schema_type.value,
        "reference_schema_version": request.reference_schema_version or "v1.0",
        "reference_schema": request.reference_schema,
        "validation_result": None,
        "contract_result": None,
        "drift_report": None,
        "error": None,
    }


def _build_response(final_state: dict) -> AgentResponse:
    v = final_state.get("validation_result")
    return AgentResponse(
        loan_id=v.loan_id if v else None,
        validation=v,
        contract=final_state.get("contract_result"),
        drift_report=final_state.get("drift_report"),
        error=final_state.get("error"),
    )


@router.post("/validate", response_model=AgentResponse)
async def validate_loan(request: AgentRequest) -> AgentResponse:
    loan_data = _resolve_loan_data(request)
    initial_state = _build_state(loan_data, request)
    try:
        final_state = maxex_graph.invoke(initial_state)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return _build_response(final_state)


@router.post("/validate/stream")
async def validate_loan_stream(request: AgentRequest):
    """
    SSE stream of node events:
      {"type": "node_start",  "node": "<name>"}
      {"type": "node_done",   "node": "<name>"}
      {"type": "node_skip",   "node": "<name>"}
      {"type": "done",        "result": <AgentResponse>}
      {"type": "error",       "message": "<msg>"}
    """
    loan_data = _resolve_loan_data(request)
    initial_state = _build_state(loan_data, request)

    loop = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def put(event: dict):
        asyncio.run_coroutine_threadsafe(queue.put(event), loop).result()

    def run_graph():
        try:
            put({"type": "node_start", "node": "validator"})

            last_state: dict = dict(initial_state)
            for chunk in maxex_graph.stream(initial_state):
                for node_name, state_update in chunk.items():
                    last_state = {**last_state, **state_update}
                    put({"type": "node_done", "node": node_name})

                    if node_name == "validator":
                        v = last_state.get("validation_result")
                        if v and v.is_valid:
                            put({"type": "node_start", "node": "contract_generator"})
                        else:
                            put({"type": "node_skip", "node": "contract_generator"})
                            put({"type": "node_start", "node": "schema_drift_detector"})

                    elif node_name == "contract_generator":
                        put({"type": "node_start", "node": "schema_drift_detector"})

            result = _build_response(last_state)
            put({"type": "done", "result": result.model_dump()})

        except Exception as exc:
            put({"type": "error", "message": str(exc)})
        finally:
            asyncio.run_coroutine_threadsafe(queue.put(None), loop).result()

    threading.Thread(target=run_graph, daemon=True).start()

    async def generate():
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=120)
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'type': 'error', 'message': 'pipeline timeout'})}\n\n"
                return
            if item is None:
                return
            yield f"data: {json.dumps(item)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/health")
async def health():
    return {"status": "ok", "service": "maxex-agent"}
