import { ComplaintForm } from "@/components/complaint-form";
import { PageTitle } from "@/components/ui";
import { RoleGuard } from "@/components/role-guard";

export default function NewComplaintPage() {
  return <RoleGuard roles={["citizen"]}><div><PageTitle eyebrow="Citizen report" title="Report a community issue" description="Share clear details so the right Pasig City team can act quickly."/><ComplaintForm/></div></RoleGuard>;
}
