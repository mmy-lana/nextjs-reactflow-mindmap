/**
 * The editor route.
 *
 * A server component only: the id is read from the route and handed to the
 * client editor, which is the component that owns IndexedDB. Nothing is read
 * from the database here, because the database lives in the browser.
 */

import MindMapEditor from "./MindMapEditor";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MapPage({ params }: PageProps) {
  const { id } = await params;
  return <MindMapEditor documentId={id} />;
}
