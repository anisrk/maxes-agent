import { useRef, useState, type DragEvent } from "react";
import { formatFileSize, fileFormat, type UploadFormat } from "../utils/csv";

interface UploadedFile {
  name: string;
  size: number;
  format: UploadFormat;
}

interface Props {
  onFile: (content: string, format: UploadFormat, filename: string, fileSize: number) => void;
  onClear?: () => void;
}

const FORMAT_BADGE: Record<UploadFormat, string> = {
  csv:  "bg-blue-100 text-blue-700 border-blue-200",
  json: "bg-yellow-100 text-yellow-700 border-yellow-200",
  xml:  "bg-green-100 text-green-700 border-green-200",
  yaml: "bg-purple-100 text-purple-700 border-purple-200",
};

const FORMAT_ROUTE: Record<UploadFormat, string> = {
  csv:  "Rows → Batch tab",
  json: "Array → Batch · Object → Validate",
  xml:  "Loaded into validate input",
  yaml: "Loaded into validate input",
};

export function FileUploadZone({ onFile, onClear }: Props) {
  const [isDragging, setIsDragging]     = useState(false);
  const [uploaded, setUploaded]         = useState<UploadedFile | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const inputRef                        = useRef<HTMLInputElement>(null);

  function processFile(file: File) {
    setError(null);
    const fmt = fileFormat(file.name);
    if (!fmt) {
      setError(`Unsupported file type. Use CSV, JSON, XML or YAML.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setUploaded({ name: file.name, size: file.size, format: fmt });
      onFile(text, fmt, file.name, file.size);
    };
    reader.readAsText(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function onDragOver(e: DragEvent) { e.preventDefault(); setIsDragging(true); }
  function onDragLeave(e: DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }

  function clear() {
    setUploaded(null);
    setError(null);
  }

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => !uploaded && inputRef.current?.click()}
      className={`relative rounded-xl border-2 border-dashed transition-all duration-150 ${
        uploaded
          ? "border-gray-200 bg-gray-50 cursor-default"
          : isDragging
          ? "border-blue-400 bg-blue-50 cursor-copy scale-[1.005]"
          : "border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.json,.xml,.yaml,.yml"
        className="hidden"
        onChange={onInputChange}
      />

      {uploaded ? (
        /* ── Uploaded state ── */
        <div className="flex items-center gap-4 px-5 py-4">
          {/* File icon */}
          <div className="shrink-0 w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center shadow-sm">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>

          {/* File info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{uploaded.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-400">{formatFileSize(uploaded.size)}</span>
              <span className="text-gray-300">·</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${FORMAT_BADGE[uploaded.format]}`}>
                {uploaded.format.toUpperCase()}
              </span>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-400">{FORMAT_ROUTE[uploaded.format]}</span>
            </div>
          </div>

          {/* Clear button */}
          <button
            onClick={(e) => { e.stopPropagation(); clear(); onClear?.(); }}
            className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
            title="Remove file"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        /* ── Empty / dragging state ── */
        <div className="flex flex-col items-center justify-center gap-2 py-7">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isDragging ? "bg-blue-100" : "bg-white border border-gray-200"}`}>
            <svg className={`w-5 h-5 transition-colors ${isDragging ? "text-blue-500" : "text-gray-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <div className="text-center">
            <p className={`text-sm font-medium transition-colors ${isDragging ? "text-blue-600" : "text-gray-600"}`}>
              {isDragging ? "Drop to upload" : "Drag & drop a file here"}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              or <span className="text-blue-500 underline underline-offset-2">click to browse</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            {["CSV", "JSON", "XML", "YAML"].map((f) => (
              <span key={f} className="text-[10px] font-medium text-gray-400 bg-white border border-gray-200 rounded px-1.5 py-0.5">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="px-5 pb-3">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}
