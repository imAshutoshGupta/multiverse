import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Multiverse · Bookings",
    short_name: "Multiverse",
    description: "Slot bookings for The Multiverse gaming cafe",
    start_url: "/staff",
    scope: "/",
    display: "standalone",
    background_color: "#07060d",
    theme_color: "#07060d",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
