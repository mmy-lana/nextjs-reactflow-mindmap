"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getDB } from "@/db/schema";
import type { MindMapDocument } from "@/types/mindmap";

export default function HomePage() {
  const router = useRouter();
  const [maps, setMaps] = useState<MindMapDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const db = getDB();
      db.documents
        .toArray()
        .then((docs) => {
          setMaps(docs);
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
        });
    } catch {
      setLoading(false);
    }
  }, []);

  const handleCreateNew = () => {
    const newId = crypto.randomUUID();
    router.push(`/map/${newId}`);
  };

  return (
    <main className="min-h-screen bg-[#0c0d0e] p-6 max-w-4xl mx-auto flex flex-col gap-6">
      <header className="flex justify-between items-center border-b border-[#282c34] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mind Mapping Canvas</h1>
          <p className="text-sm text-[#9ca3af]">Infinite grid ideation workspaces</p>
        </div>
        <button
          onClick={handleCreateNew}
          className="px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white font-medium rounded-lg transition-colors cursor-pointer"
        >
          New Map
        </button>
      </header>

      <section>
        <h2 className="text-lg font-semibold mb-4 text-[#9ca3af]">Recent Mind Maps</h2>
        {loading ? (
          <div className="text-sm text-[#9ca3af]">Loading workspaces...</div>
        ) : maps.length === 0 ? (
          <div className="border border-dashed border-[#282c34] rounded-xl p-8 text-center flex flex-col items-center gap-3">
            <p className="text-sm text-[#9ca3af]">
              No mind maps found. Start by creating your first canvas.
            </p>
            <button
              onClick={handleCreateNew}
              className="px-4 py-2 bg-[#15171a] border border-[#282c34] hover:border-[#6366f1] text-sm font-medium rounded-md transition-colors cursor-pointer"
            >
              Create Canvas
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {maps.map((doc) => (
              <Link
                key={doc.id}
                href={`/map/${doc.id}`}
                className="block p-4 rounded-xl bg-[#15171a] border border-[#282c34] hover:border-[#6366f1] transition-all"
              >
                <h3 className="font-semibold text-base mb-1 truncate">
                  {doc.title || "Untitled Map"}
                </h3>
                <p className="text-xs text-[#9ca3af]">
                  {new Date(doc.updatedAt).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
