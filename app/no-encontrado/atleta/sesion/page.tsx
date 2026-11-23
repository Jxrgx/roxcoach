import { notFound } from "next/navigation";

/** Se prerenderiza como 404: notFound() durante el prerender conserva el estado HTTP. */
export default function Page() {
  notFound();
}
