import { redirect } from "next/navigation";

// Booking now lives on the home screen.
export default function BookPage() {
  redirect("/");
}
