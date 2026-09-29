export default function Loading() {
  return (
    <div className="w-screen h-screen flex items-center justify-center bg-[#0c0d0e]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#6366f1] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-[#9ca3af]">Loading canvas...</span>
      </div>
    </div>
  );
}
