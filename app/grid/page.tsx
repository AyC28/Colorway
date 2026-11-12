import type { Metadata } from "next";
import { GridView } from "@/grid/GridView";

export const metadata: Metadata = { title: "Grid", description: "Preview your profile grid with 3:4 tiles, light or dark, and reorder it." };

export default function GridPage() {
  return <GridView />;
}
