import { redirect } from "next/navigation";

/** Client portal merged into `/client`. */
export default function PortalRedirectPage() {
  redirect("/client");
}
