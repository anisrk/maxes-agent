from langgraph.graph import StateGraph, END
from app.agent.state import AgentState
from app.agent.nodes import (
    validator_node,
    contract_generator_node,
    schema_drift_detector_node,
)


def _should_generate_contract(state: AgentState) -> str:
    """Route to contract generation only when validation passes."""
    validation = state.get("validation_result")
    if validation and validation.is_valid:
        return "contract_generator"
    return "schema_drift_detector"


def build_graph() -> StateGraph:
    graph = StateGraph(AgentState)

    graph.add_node("validator", validator_node)
    graph.add_node("contract_generator", contract_generator_node)
    graph.add_node("schema_drift_detector", schema_drift_detector_node)

    graph.set_entry_point("validator")

    graph.add_conditional_edges(
        "validator",
        _should_generate_contract,
        {
            "contract_generator": "contract_generator",
            "schema_drift_detector": "schema_drift_detector",
        },
    )

    graph.add_edge("contract_generator", "schema_drift_detector")
    graph.add_edge("schema_drift_detector", END)

    return graph.compile()


# Module-level compiled graph instance
maxex_graph = build_graph()
