import type { Metadata } from "next";
import { EditView } from "@/edit/EditView";

export const metadata: Metadata = { title: "Edit guide", description: "Slider ranges for a RAW or JPEG file, fitted toward your closest colour family." };

export default function EditPage() {
  return <EditView />;
}
