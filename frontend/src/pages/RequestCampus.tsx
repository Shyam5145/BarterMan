import CampusRequestForm from "../components/campus-request-form"

export default function RequestCampus() {
  return (
    <main className="page-shell request-campus-page">
      <section className="request-campus-intro">
        <div className="eyebrow">Campus network</div>
        <h1>Bring Barterman to your campus.</h1>
        <p>Let us know which campus you'd like us to join.</p>
      </section>
      <CampusRequestForm />
    </main>
  )
}
