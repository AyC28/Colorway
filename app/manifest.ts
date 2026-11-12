import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Colorway",
    short_name: "Colorway",
    description: "Read the colour in the photos you love and edit toward a look that is yours.",
    start_url: "/inspiration",
    display: "standalone",
    background_color: "#e5e5e5",
    theme_color: "#e5e5e5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
