import DcWorkspacePage from "../components/dc/DcWorkspacePage";

export default function DcCprPage() {
  return (
    <DcWorkspacePage
      fixedType="CPR"
      groupByProject
      title="Concrete pouring requests"
      subtitle="Manage concrete pouring requests and download the cover and two-page pouring checklist separately."
    />
  );
}
