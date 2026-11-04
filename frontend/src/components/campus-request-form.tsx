import { FormEvent, useState } from "react"
import { Input } from "./ui/input"
import { Label } from "./ui/label"

export default function CampusRequestForm() {
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const campus = String(formData.get("campus") || "").trim()
    if (campus) {
      window.localStorage.setItem("barterman-campus", campus)
    }
    setSubmitted(true)
  }

  return (
    <div className="campus-request-card">
      <h2>Tell us about your campus</h2>
      <p className="campus-request-description">
        Share a few details so we can learn where students want Barterman next.
      </p>

      {submitted ? (
        <p className="campus-request-success" role="status">
          Thanks for your interest. Your campus request has been noted.
        </p>
      ) : (
        <form className="campus-request-form" onSubmit={handleSubmit}>
          <div className="campus-request-name-row">
            <div className="campus-request-field">
              <Label htmlFor="request-first-name">First name</Label>
              <Input id="request-first-name" name="firstName" placeholder="First name" autoComplete="given-name" required />
            </div>
            <div className="campus-request-field">
              <Label htmlFor="request-last-name">Last name</Label>
              <Input id="request-last-name" name="lastName" placeholder="Last name" autoComplete="family-name" required />
            </div>
          </div>
          <div className="campus-request-field">
            <Label htmlFor="request-campus-name">Campus or university</Label>
            <Input id="request-campus-name" name="campus" placeholder="Your campus name" autoComplete="organization" required />
          </div>
          <div className="campus-request-field">
            <Label htmlFor="request-campus-email">Student email address</Label>
            <Input id="request-campus-email" name="email" placeholder="you@university.edu" type="email" autoComplete="email" required />
          </div>
          <button className="campus-request-submit" type="submit">
            Request campus <span aria-hidden="true">→</span>
          </button>
        </form>
      )}
    </div>
  )
}
