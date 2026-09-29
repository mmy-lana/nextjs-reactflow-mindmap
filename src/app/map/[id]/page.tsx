import MindMapEditor from "./MindMapEditor";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MapPage({ params }: PageProps) {
  const { id } = await params;
  return <MindMapEditor documentId={id} />;
}
