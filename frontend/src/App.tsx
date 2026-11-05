import { ChangeEvent, FormEvent, Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react"
import { motion, useMotionValueEvent, useScroll } from "motion/react"
import { ContainerScroll } from "./components/ui/container-scroll-animation"
import { FlipWords } from "./components/ui/flip-words"
import RequestCampus from "./pages/RequestCampus"
import { AuthLoading, CompleteProfile, CreatePassword, ForgotPassword, OnboardingNext, Register, SignIn, VerifyEmail } from "./pages/AuthFlow"
import { useAuth, type AuthStatus } from "./context/AuthContext"
import { useRealtime } from "./context/RealtimeContext"
import { Avatar } from "./components/Avatar"
import { useIsMobile } from "./hooks/useIsMobile"
import Messages from "./pages/Messages"
import Profile from "./pages/Profile"
import { useWishlist } from "./context/WishlistContext"
import { fetchWishlist, type SavedListing } from "./lib/wishlist"
import { startConversation } from "./lib/chat"
import { createOffer, fetchReceivedOffers } from "./lib/offers"
import SellerOffers from "./pages/SellerOffers"
import SellerOrders from "./pages/SellerOrders"
import {
  deleteListing,
  fetchListing,
  fetchListings,
  fetchMyListings,
  formatInr,
  formatListingPrice,
  listingTag,
  listingTypeLabel,
  orderedImageUrls,
  primaryImageUrl,
  rentalSuffix,
  saveListing,
  statusLabel,
  updateListingStatus,
  type ListingQuery,
} from "./lib/listings"
import {
  LISTING_CATEGORIES,
  LISTING_CONDITIONS,
  RENTAL_DURATIONS,
  type Listing,
  type ListingInput,
  type ListingSort,
  type ListingStatus,
  type ListingType,
} from "./types/listing"

type Route =
  | "/"
  | "/marketplace"
  | `/product/${string}`
  | "/seller-hub"
  | "/sell"
  | "/messages"
  | "/profile"
  | "/request-campus"
  | "/sign-in"
  | "/register"
  | "/forgot-password"
  | "/verify-email"
  | "/create-password"
  | "/complete-profile"
  | "/onboarding-next"

const products = [
  {
    name: "Sony WH-1000XM4 Noise Cancelling",
    price: "₹11,500",
    image: "/assets/69c2b.png",
    route: "/product/sony-wh-1000xm4" as Route,
    tag: "BUY",
    seller: "Julian K.",
    rating: "4.9",
    reviews: 28,
  },
  {
    name: "Principles of Neural Science (6th Ed.)",
    price: "₹3,700",
    image: "/assets/9c8f4.png",
    tag: "BUY",
    seller: "Mia Patel",
    rating: "4.8",
    reviews: 16,
  },
  {
    name: "Specialized Sirrus Commuter + U-Lock",
    price: "₹1,500/day",
    image: "/assets/16e7f.png",
    tag: "RENT OR BUY",
    seller: "Rohan Mehta",
    rating: "5.0",
    reviews: 11,
  },
  {
    name: "Fujifilm X-T30 II + 18–55mm",
    price: "₹2,300/day",
    image: "/assets/9d09f.png",
    tag: "DAILY RENTAL",
    seller: "Chloe Chen",
    rating: "4.9",
    reviews: 22,
  },
  {
    name: "Herman Miller Sayl Task Chair",
    price: "₹18,000",
    image: "/assets/d07b8.png",
    tag: "BUY",
    seller: "Aarav Shah",
    rating: "4.8",
    reviews: 9,
  },
  {
    name: "Patagonia Synchilla Snap-T",
    price: "₹2,500",
    image: "/assets/025ac.png",
    tag: "BUY",
    seller: "Priya Nair",
    rating: "4.9",
    reviews: 31,
  },
  {
    name: "TI-84 Plus CE Color Graphing",
    price: "₹4,500",
    image: "/assets/de7ef.png",
    tag: "BUY",
    seller: "Nikhil Rao",
    rating: "4.7",
    reviews: 14,
  },
  {
    name: "Campus-Approved Micro-Fridge",
    price: "₹7,900",
    image: "/assets/c3d1d.png",
    tag: "BUY",
    seller: "Ella Brooks",
    rating: "4.9",
    reviews: 19,
  },
]

const currentRoute = () => (window.location.pathname || "/") as Route

function useRoute() {
  const [route, setRoute] = useState<Route>(currentRoute)
  useEffect(() => {
    const onPop = () => setRoute(currentRoute())
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])
  // Accepts a full path with query string (used to return to a page after sign-in).
  const navigate = useCallback((href: string, options: { replace?: boolean } = {}) => {
    if (options.replace) window.history.replaceState({}, "", href)
    else window.history.pushState({}, "", href)
    setRoute(currentRoute())
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [])
  const go = useCallback((next: Route) => navigate(next), [navigate])
  return { route, go, navigate }
}

function scrollToHomeSection(id: string, go: (route: Route) => void, route: Route) {
  if (route !== "/") go("/")
  window.setTimeout(() => {
    document.getElementById(id)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    })
  }, route === "/" ? 0 : 80)
}

function Header({ go, route, signedIn, onSignOut }: { go: (route: Route) => void; route: Route; signedIn: boolean; onSignOut: () => void }) {
  const { unreadTotal } = useRealtime()
  // Phones: the links collapse into a menu opened by the ☰ button.
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => setMenuOpen(false), [route])
  const open = (next: Route) => {
    setMenuOpen(false)
    go(next)
  }
  const authButton = signedIn
    ? <button onClick={() => { setMenuOpen(false); onSignOut() }}>Sign Out</button>
    : <button onClick={() => open("/sign-in")}>Sign In</button>
  return (
    <header className={`${route === "/" ? "site-header" : "site-header site-header-pinned"}${menuOpen ? " nav-menu-open" : ""}`}>
      <div className="nav-shell">
        <button className="brand" onClick={() => open("/")}>
          Barterman
        </button>
        <button
          type="button"
          className="nav-menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          aria-label={menuOpen ? "Close menu" : unreadTotal ? `Open menu, ${unreadTotal} unread messages` : "Open menu"}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <span aria-hidden="true">{menuOpen ? "✕" : "☰"}</span>
          {!menuOpen && unreadTotal > 0 && <span className="nav-unread-badge" aria-hidden="true">{unreadTotal > 99 ? "99+" : unreadTotal}</span>}
        </button>
        <nav id="site-nav">
          <button className="nav-explore" onClick={() => open("/marketplace")}>Explore</button>
          {route === "/" ? (
            <>
              <button className="home-anchor-link" onClick={() => { setMenuOpen(false); scrollToHomeSection("how-it-works", go, route) }}>How It Works</button>
              {authButton}
              <button className="nav-join" onClick={() => open("/request-campus")}>Join your campus</button>
            </>
          ) : (
            <>
              <button onClick={() => open("/seller-hub")}>Sell an Item</button>
              <button onClick={() => open("/messages")} aria-label={unreadTotal ? `Messages, ${unreadTotal} unread` : undefined}>
                Messages
                {unreadTotal > 0 && <span className="nav-unread-badge" aria-hidden="true">{unreadTotal > 99 ? "99+" : unreadTotal}</span>}
              </button>
              <button className="profile-link" onClick={() => open("/profile")}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M5 21a7 7 0 0 1 14 0" />
                </svg>
                My Profile
              </button>
              {authButton}
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

function Footer({ go, route }: { go: (route: Route) => void; route: Route }) {
  return (
    <footer>
      <div className="footer-columns">
        <div className="footer-brand-column" data-scroll-reveal>
          <button className="brand" onClick={() => go("/")}>Barterman</button>
          <p>A campus-first marketplace for useful finds, local connections, and easier student living.</p>
        </div>
        <div className="footer-link-column" data-scroll-reveal>
          <h3>Explore</h3>
          <button onClick={() => go("/marketplace")}>Marketplace</button>
          <button onClick={() => scrollToHomeSection("featured-listings", go, route)}>Featured Listings</button>
          <button onClick={() => scrollToHomeSection("how-it-works", go, route)}>How It Works</button>
        </div>
        <div className="footer-link-column" data-scroll-reveal>
          <h3>Community</h3>
          <button onClick={() => scrollToHomeSection("check-your-campus", go, route)}>Check Your Campus</button>
          <button onClick={() => go("/request-campus")}>Request Your Campus</button>
        </div>
        <div className="footer-link-column" data-scroll-reveal>
          <h3>Support</h3>
          <button onClick={() => scrollToHomeSection("faqs", go, route)}>FAQs</button>
          <button onClick={() => scrollToHomeSection("faqs", go, route)}>Safety</button>
          <button onClick={() => go("/messages")}>Contact Us</button>
        </div>
      </div>
      <div className="footer-bottom">
        <span>
          © 2025 Barterman Technologies. Campus marketplace for students.
        </span>
        <span className="verified">
          Built around local student communities
        </span>
      </div>
    </footer>
  )
}

// Clearly separated demo content for the homepage preview until live listings are connected.
type FeaturedListing = {
  id: string
  name: string
  price: string
  condition: string
  campus: string
  category: string
  image: string
  route: Route
  verified: boolean
}

const featuredGalleryItems: FeaturedListing[] = [
  { id: "sony-wh-1000xm4", name: "Sony WH-1000XM4 Headphones", price: "₹11,500", condition: "Like new", campus: "PES University", category: "Audio", image: "/assets/69c2b.png", route: "/product/sony-wh-1000xm4", verified: true },
  { id: "neural-science", name: "Principles of Neural Science", price: "₹3,700", condition: "Good", campus: "Christ University", category: "Books", image: "/assets/9c8f4.png", route: "/product/sony-wh-1000xm4", verified: true },
  { id: "sirrus-bike", name: "Specialized Sirrus Commuter Bike", price: "₹1,500 / day", condition: "Very good", campus: "RV University", category: "Transport", image: "/assets/16e7f.png", route: "/product/sony-wh-1000xm4", verified: true },
  { id: "xt30-camera", name: "Fujifilm X-T30 II Camera", price: "₹2,300 / day", condition: "Like new", campus: "Jain University", category: "Photography", image: "/assets/9d09f.png", route: "/product/sony-wh-1000xm4", verified: true },
  { id: "macbook-air", name: "MacBook Air 13-inch", price: "₹58,000", condition: "Excellent", campus: "BMS College of Engineering", category: "Electronics", image: "/assets/d07b8.png", route: "/product/sony-wh-1000xm4", verified: true },
  { id: "study-desk", name: "Study Desk with Drawer", price: "₹8,900", condition: "Very good", campus: "Ramaiah Institute of Technology", category: "Furniture", image: "/assets/c3d1d.png", route: "/product/sony-wh-1000xm4", verified: true },
]

const howSteps = [
  { title: "Join your campus", description: "Register and confirm your student community." },
  { title: "Discover or list", description: "Browse campus listings or post something you want to sell." },
  { title: "Connect with students", description: "Chat, ask questions, negotiate, or make offers." },
  { title: "Meet and exchange", description: "Arrange a convenient campus pickup and complete the handoff." },
]

const sellerAssistantFeatures = [
  { title: "Learns your preferences", description: "Understands your selling style and the instructions you provide." },
  { title: "Responds to buyers", description: "Can help answer common product and availability questions." },
  { title: "Smart negotiation", description: "Works within the price limits you choose." },
]

const sampleTestimonials = [
  { quote: "Found a desk lamp for my room without waiting on shipping.", name: "Aanya", campus: "PES University" },
  { quote: "It was easy to ask about the bike and arrange a campus pickup.", name: "Rishabh", campus: "Christ University" },
  { quote: "Selling my old course books felt much more local and straightforward.", name: "Mira", campus: "RV University" },
]

const homepageFaqs = [
  { question: "What is Barterman?", answer: "Barterman is a campus-focused marketplace concept for students to find, list, rent, and discuss useful items locally." },
  { question: "Who can join Barterman?", answer: "The experience is designed for student communities. Campus availability and verification features are still being developed." },
  { question: "How do I buy something?", answer: "Browse a listing, review its details, and contact the student to ask questions and discuss pickup." },
  { question: "How do I list a product for sale?", answer: "Use Sell an Item to prepare a listing. Publishing and marketplace actions are currently part of the prototype." },
  { question: "Can I rent or exchange products?", answer: "Rentals and exchanges are part of the planned campus marketplace experience; availability depends on each listing." },
  { question: "How does campus verification work?", answer: "Campus verification is a planned part of the student-focused experience and is not currently a complete live identity-verification service." },
  { question: "How does the AI seller assistant work?", answer: "The assistant shown here is a product preview. AI responses and negotiation are not live yet." },
  { question: "How do I request my campus?", answer: "Open Request Your Campus and share your campus details. The current form is a prototype and does not yet send data to a live service." },
]

function FeaturedListingsGallery({ go }: { go: (route: Route) => void }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 760px)")
    const updateMode = () => setIsMobile(mediaQuery.matches)

    updateMode()
    mediaQuery.addEventListener("change", updateMode)
    return () => mediaQuery.removeEventListener("change", updateMode)
  }, [])

  const onCardEnter = (index: number) => {
    if (!isMobile) setActiveIndex(index)
  }

  return (
    <div className="featured-expand-gallery" onMouseLeave={() => !isMobile && setActiveIndex(0)}>
      {featuredGalleryItems.map((product, index) => {
        const isActive = activeIndex === index

        return (
          <motion.article
            key={product.id}
            className={`featured-expand-item${isActive ? " is-active" : ""}`}
            tabIndex={0}
            layout
            initial={false}
            animate={
              isMobile
                ? { flex: "0 0 78vw", opacity: 1 }
                : { flex: isActive ? "1.9 1 0" : "0.8 1 0", opacity: 1 }
            }
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            onMouseEnter={() => onCardEnter(index)}
            onFocus={() => onCardEnter(index)}
            onClick={() => {
              if (isMobile) setActiveIndex(index)
            }}
            aria-label={product.name}
          >
            <div className="featured-expand-media">
              <img src={product.image} alt={product.name} loading="lazy" draggable={false} />
            </div>

            <motion.div
              className="featured-expand-info"
              initial={false}
              animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 18 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="featured-expand-meta">
                <span>{product.category}</span>
                {product.verified && <span className="featured-verified">Verified seller</span>}
              </div>
              <h3>{product.name}</h3>
              <div className="featured-expand-details">
                <strong>{product.price}</strong>
                <span>{product.condition}</span>
              </div>
              <p>{product.campus}</p>
              <button
                className="featured-expand-button"
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  go(product.route)
                }}
              >
                View Product
              </button>
            </motion.div>
          </motion.article>
        )
      })}
    </div>
  )
}

function HowItWorksSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const [activeStep, setActiveStep] = useState(0)
  const [pinEnabled, setPinEnabled] = useState(() =>
    window.matchMedia("(min-width: 761px) and (prefers-reduced-motion: no-preference)").matches,
  )
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 0.9", "end 220px"],
  })
  useMotionValueEvent(scrollYProgress, "change", (progress) => {
    const nextStep = Math.min(howSteps.length - 1, Math.floor(progress * howSteps.length))
    setActiveStep((currentStep) => currentStep === nextStep ? currentStep : nextStep)
  })

  useEffect(() => {
    const desktopMotion = window.matchMedia("(min-width: 761px) and (prefers-reduced-motion: no-preference)")
    const updatePinMode = () => setPinEnabled(desktopMotion.matches)
    updatePinMode()
    desktopMotion.addEventListener("change", updatePinMode)
    return () => desktopMotion.removeEventListener("change", updatePinMode)
  }, [])

  return (
    <section
      ref={sectionRef}
      id="how-it-works"
      className="landing-section landing-steps-section"
      aria-labelledby="steps-heading"
      data-scroll-section
      data-story-enabled={pinEnabled ? "true" : undefined}
    >
      <div className="landing-steps-sticky">
        <div className="landing-section-heading centered-heading" data-scroll-reveal={!pinEnabled ? "" : undefined}>
          <div>
            <span className="eyebrow">Four simple steps</span>
            <h2 id="steps-heading">Campus exchange, made simple.</h2>
          </div>
        </div>
        <div className="landing-steps-timeline">
          <ol className="landing-steps-grid" data-scroll-reveal={!pinEnabled ? "" : undefined}>
            {howSteps.map((step, index) => {
              const stepState = index === activeStep ? "is-active" : index < activeStep ? "is-past" : "is-future"
              return (
                <motion.li
                  className={`landing-step${pinEnabled ? ` ${stepState}` : ""}`}
                  data-scroll-reveal={!pinEnabled ? "" : undefined}
                  key={step.title}
                  initial={pinEnabled ? false : undefined}
                  animate={pinEnabled ? {
                    opacity: index === activeStep ? 1 : index < activeStep ? 0.48 : 0.58,
                  } : undefined}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  aria-current={pinEnabled && index === activeStep ? "step" : undefined}
                >
                  <span className="landing-step-number" data-scroll-reveal={!pinEnabled ? "" : undefined}>0{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </motion.li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}

function PublicLanding({ go }: { go: (route: Route) => void }) {
  useLayoutEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reducedMotion || !("IntersectionObserver" in window)) return

    const targets = document.querySelectorAll<HTMLElement>("[data-scroll-reveal], [data-scroll-section]")
    if (!targets.length) return

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add("is-in-view")
        observer.unobserve(entry.target)
      })
    }, { threshold: 0.16 })

    document.body.classList.add("scroll-reveals-ready")
    targets.forEach((target) => observer.observe(target))

    return () => {
      observer.disconnect()
      document.body.classList.remove("scroll-reveals-ready")
    }
  }, [])

  return (
    <main className="public-landing">
      <section className="phone-hero" aria-label="Barterman campus marketplace">
        <ContainerScroll
          titleComponent={
            <div className="phone-hero-title" data-scroll-reveal>
              <span className="phone-hero-eyebrow">Campus marketplace</span>
              <h1>
                <strong>Barterman</strong>
                <span>Campus exchange, made simple.</span>
              </h1>
            </div>
          }
        >
          <img
            src="/assets/d3be5aa0-97c1-43e3-b912-b9e6e2b53b07.png"
            alt="Thank you for ordering from Barterman"
            className="w-full h-full object-cover object-center rounded-xl"
            draggable={false}
          />
        </ContainerScroll>
      </section>

      <section className="landing-flip-words" aria-label="Explore Barterman">
        <p data-scroll-reveal>
          Just <FlipWords words={["buy", "sell", "rent"]} className="landing-flip-word" /> goods with Barterman.
        </p>
        <span data-scroll-reveal>Buy, sell, rent, and trade with verified students nearby.</span>
        <button className="forest-button landing-marketplace-cta" data-scroll-reveal onClick={() => go("/marketplace")}>
          Explore marketplace
        </button>
      </section>

      <section id="featured-listings" className="landing-section landing-featured-section" aria-labelledby="featured-heading">
        <div className="landing-section-heading" data-scroll-reveal>
          <div>
            <span className="eyebrow">Campus finds</span>
            <h2 id="featured-heading">Discover what’s available on your campus.</h2>
            <p>Find great deals from students around you.</p>
          </div>
          <span className="sample-content-label">Sample listings · preview data</span>
        </div>

        <FeaturedListingsGallery go={go} />

        <button className="forest-button landing-centered-cta" data-scroll-reveal onClick={() => go("/marketplace")}>Explore All Listings</button>
      </section>

      <HowItWorksSection />

      <section id="ai-assistant" className="landing-section landing-ai-section" aria-labelledby="ai-heading" data-scroll-section>
        <div className="landing-ai-copy" data-scroll-reveal>
          <span className="eyebrow">Seller assistant · product preview</span>
          <h2 id="ai-heading">Your AI assistant. Your selling partner.</h2>
          <p>Let your personal AI agent help manage buyer conversations, answer common questions, and negotiate within your preferences — even when you’re busy.</p>
          <ul className="landing-ai-features">
            {sellerAssistantFeatures.map((feature) => (
              <li data-scroll-reveal key={feature.title}><span aria-hidden="true">✓</span><div><strong>{feature.title}</strong><p>{feature.description}</p></div></li>
            ))}
          </ul>
          <button className="forest-button" onClick={() => scrollToHomeSection("ai-assistant-preview", go, "/")}>Discover AI Selling</button>
          <span className="landing-preview-note">Preview only — AI responses are not live yet.</span>
        </div>
        <div id="ai-assistant-preview" className="ai-chat-preview" data-scroll-reveal aria-label="Sample AI seller assistant conversation">
          <div className="ai-chat-header"><span className="ai-status-dot" />Seller assistant <small>PRODUCT PREVIEW</small></div>
          <div className="ai-chat-item"><img src="/assets/d07b8.png" alt="" loading="lazy" /><div><strong>Study chair</strong><span>Campus listing preview</span></div></div>
          <div className="ai-chat-message buyer-message" data-scroll-reveal><small>BUYER · SAMPLE</small><p>Hi! Is the chair still available?</p></div>
          <div className="ai-chat-message assistant-message" data-scroll-reveal><small>SELLER ASSISTANT · PREVIEW</small><p>It is available. Pickup can be arranged on campus this afternoon.</p></div>
          <div className="ai-chat-footer">Example conversation · not connected to a live assistant</div>
        </div>
      </section>

      <section id="student-experiences" className="landing-section landing-light" aria-labelledby="experiences-heading">
        <div className="landing-section-heading" data-scroll-reveal>
          <div>
            <span className="eyebrow">Student experiences</span>
            <h2 id="experiences-heading">A better way to exchange on campus.</h2>
          </div>
          <span className="sample-content-label">Sample testimonials</span>
        </div>
        <div className="landing-testimonials-grid">
          {sampleTestimonials.map((testimonial) => (
            <article className="landing-testimonial-card" data-scroll-reveal key={testimonial.name}>
              <span className="sample-testimonial-label">SAMPLE</span>
              <p>“{testimonial.quote}”</p>
              <div><strong>{testimonial.name}</strong><span>{testimonial.campus}</span></div>
            </article>
          ))}
        </div>
      </section>

      <section id="check-your-campus" className="landing-section landing-campus-trust" aria-labelledby="trusted-campus-heading">
        <div className="landing-campus-trust-inner" data-scroll-reveal>
          <h2 id="trusted-campus-heading">Trusted by Campuses</h2>
          <ul className="trusted-campus-list">
            <li data-scroll-reveal>PES University</li>
            <li data-scroll-reveal>Christ University</li>
            <li data-scroll-reveal>RV University</li>
            <li data-scroll-reveal>Ramaiah Institute of Technology</li>
            <li data-scroll-reveal>BMS College of Engineering</li>
            <li data-scroll-reveal>Jain University</li>
          </ul>
        </div>
      </section>

      <section id="faqs" className="landing-section landing-faq-section" aria-labelledby="faq-heading">
        <div className="landing-section-heading centered-heading" data-scroll-reveal>
          <div>
            <span className="eyebrow">Helpful answers</span>
            <h2 id="faq-heading">Got questions? We’ve got answers.</h2>
          </div>
        </div>
        <div className="landing-faq-grid">
          {homepageFaqs.map((faq) => (
            <details className="landing-faq-item" data-scroll-reveal key={faq.question}>
              <summary>{faq.question}<span aria-hidden="true">+</span></summary>
              <div className="landing-faq-answer"><div className="landing-faq-answer-inner"><p>{faq.answer}</p></div></div>
            </details>
          ))}
        </div>
      </section>

      <section className="landing-final-cta" aria-labelledby="final-cta-heading">
        <div data-scroll-reveal>
          <span className="eyebrow">Made for campus life</span>
          <h2 id="final-cta-heading">Your campus. Your marketplace. Your community.</h2>
          <p>Join students who are making campus buying, selling, renting and exchanging simpler.</p>
        </div>
        <div className="landing-final-actions" data-scroll-reveal>
          <button className="forest-button" data-scroll-reveal onClick={() => go("/marketplace")}>Explore Marketplace</button>
          <button className="outline-button" data-scroll-reveal onClick={() => go("/request-campus")}>Request Your Campus</button>
        </div>
      </section>
    </main>
  )
}

// Shows the user's photo, or their initial when they have none (for example, email sign-ups).
function HeartIcon({ filled }: { filled: boolean }) {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
}

const MARKET_FILTERS: Array<{ id: string; label: string; query: Pick<ListingQuery, "type" | "category"> }> = [
  { id: "all", label: "All Listings", query: {} },
  { id: "buy", label: "Buy", query: { type: "sale" } },
  { id: "rent", label: "Rent", query: { type: "rent" } },
  { id: "electronics", label: "Electronics", query: { category: "Electronics" } },
  { id: "books", label: "Books & Notes", query: { category: "Books & Study Materials" } },
]

const MARKET_SORTS: Array<{ value: ListingSort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
]

const MARKET_PAGE_SIZE = 24

function ListingCard({ listing, saved, onToggleSaved, onOpen }: {
  listing: Listing
  saved: boolean
  onToggleSaved: (event: React.MouseEvent) => void
  onOpen: () => void
}) {
  const cover = primaryImageUrl(listing)
  return (
    <article
      className="product-card clickable"
      role="link"
      tabIndex={0}
      aria-label={listing.title}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.key === "Enter") onOpen() }}
    >
      <div className="image-wrap">
        {cover && <img src={cover} alt="" loading="lazy" />}
        <span>{listing.status === "active" ? listingTag(listing) : statusLabel(listing.status).toUpperCase()}</span>
        <b role="button" aria-label={saved ? "Remove from wishlist" : "Add to wishlist"} aria-pressed={saved} className={saved ? "wishlist-active" : ""} onClick={onToggleSaved}>
          <HeartIcon filled={saved} />
        </b>
      </div>
      <h3>{listing.title}</h3>
      <div className="product-seller-review">
        <span>{listing.seller.name}</span>
        {listing.condition && <span> | {listing.condition}</span>}
      </div>
      <div className="price">
        <strong>{formatListingPrice(listing)}</strong>
      </div>
    </article>
  )
}

/** Marketplace chip that shows the signed-in student's hearted listings (no separate page). */
const WISHLIST_FILTER_ID = "wishlist"

function sortListings(items: Listing[], sort: ListingSort) {
  if (sort === "newest") return items
  const price = (listing: Listing) => (listing.listingType === "for_rent" ? listing.rentalPrice : listing.price) ?? 0
  return [...items].sort((left, right) => (sort === "price_asc" ? price(left) - price(right) : price(right) - price(left)))
}

function Marketplace({ go }: { go: (route: Route) => void }) {
  const { user, status: authStatus } = useAuth()
  const wishlist = useWishlist()
  const [savedListings, setSavedListings] = useState<SavedListing[]>([])
  const [savedState, setSavedState] = useState<"loading" | "ready" | "error">("loading")
  const [savedError, setSavedError] = useState("")
  const [query, setQuery] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [filterId, setFilterId] = useState("all")
  const [sort, setSort] = useState<ListingSort>("newest")
  const [listings, setListings] = useState<Listing[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading")
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [reloadKey, setReloadKey] = useState(0)
  // Hearts on the sample cards only (they aren't real listings, so they aren't saved to the account).
  const [savedItems, setSavedItems] = useState<Record<string, boolean>>({})
  const wishlistMode = filterId === WISHLIST_FILTER_ID

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const filter = MARKET_FILTERS.find((item) => item.id === filterId) ?? MARKET_FILTERS[0]

  // Wishlist chip: load the saved listings (with their current status) from the account.
  useEffect(() => {
    if (!wishlistMode || authStatus !== "ready") return
    let cancelled = false
    setSavedState("loading")
    setSavedError("")
    fetchWishlist()
      .then((items) => {
        if (cancelled) return
        setSavedListings(items)
        setSavedState("ready")
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setSavedError(error instanceof Error ? error.message : "We couldn't load your wishlist.")
        setSavedState("error")
      })
    return () => { cancelled = true }
  }, [wishlistMode, authStatus, reloadKey])

  useEffect(() => {
    if (wishlistMode) return
    let cancelled = false
    setLoadState("loading")
    setLoadError("")
    fetchListings({ q: searchTerm, sort, page: 1, limit: MARKET_PAGE_SIZE, ...filter.query })
      .then((result) => {
        if (cancelled) return
        setListings(result.items)
        setTotal(result.total)
        setPage(1)
        setHasMore(result.hasMore)
        setLoadState("ready")
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : "We couldn't load listings.")
        setLoadState("error")
      })
    return () => { cancelled = true }
  }, [searchTerm, sort, filter, reloadKey, wishlistMode])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const result = await fetchListings({ q: searchTerm, sort, page: page + 1, limit: MARKET_PAGE_SIZE, ...filter.query })
      setListings((current) => [...current, ...result.items.filter((item) => !current.some((existing) => existing.id === item.id))])
      setTotal(result.total)
      setPage(result.page)
      setHasMore(result.hasMore)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "We couldn't load more listings.")
    } finally {
      setLoadingMore(false)
    }
  }

  const toggleSavedItem = (key: string, event?: React.MouseEvent) => {
    event?.stopPropagation()
    setSavedItems((previous) => ({ ...previous, [key]: !previous[key] }))
  }

  // Real listings are saved to the student's account; signed-out visitors are asked to sign in.
  const toggleWishlist = (listingId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    void wishlist.toggle(listingId).then((result) => {
      if (result === "sign-in") go("/sign-in")
    })
  }

  const chooseFilter = (id: string) => {
    if (id === WISHLIST_FILTER_ID && authStatus !== "ready") {
      go("/sign-in")
      return
    }
    setFilterId(id)
  }

  // In the Wishlist chip, un-hearted cards disappear right away; search and sort apply here too.
  const visibleSaved = useMemo(() => {
    const term = searchTerm.toLowerCase()
    const items = savedListings.filter(
      (listing) => wishlist.isSaved(listing.id) && (!term || `${listing.title} ${listing.category} ${listing.description}`.toLowerCase().includes(term)),
    )
    return sortListings(items, sort)
  }, [savedListings, wishlist, searchTerm, sort])

  // Until students publish real listings, show the original sample cards so the page isn't empty.
  const showSamples = !wishlistMode && loadState === "ready" && total === 0 && !searchTerm && filterId === "all"
  const countLabel = wishlistMode
    ? savedState === "ready" ? `${visibleSaved.length} saved` : ""
    : loadState !== "ready" ? "" : showSamples ? `${products.length} sample listings` : `${total} listing${total === 1 ? "" : "s"}`

  return (
    <main>
      <section className="market-head">
        <div className="title-row">
          <h1>Fresh on {user?.college || "campus"}</h1>
        </div>
        <label className="market-search">
          <svg className="market-search-icon" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search listings"
            aria-label="Search marketplace listings"
          />
        </label>
        <div className="filters" role="group" aria-label="Filter listings">
          {MARKET_FILTERS.map((item) => (
            <button key={item.id} type="button" className={item.id === filterId ? "active" : ""} aria-pressed={item.id === filterId} onClick={() => chooseFilter(item.id)}>
              {item.label}
            </button>
          ))}
          <button
            type="button"
            className={`wishlist-chip${wishlistMode ? " active" : ""}`}
            aria-pressed={wishlistMode}
            onClick={() => chooseFilter(WISHLIST_FILTER_ID)}
          >
            <HeartIcon filled={wishlistMode || wishlist.count > 0} /> Wishlist{wishlist.count > 0 ? ` (${wishlist.count})` : ""}
          </button>
          <select className="market-sort" value={sort} onChange={(event) => setSort(event.target.value as ListingSort)} aria-label="Sort listings">
            {MARKET_SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </section>
      <section className="listings">
        <div className="section-title">
          <h2>{wishlistMode ? "Your wishlist" : showSamples ? "Sample listings" : "Recently listed"}</h2>
          <span>{countLabel}</span>
        </div>

        {wishlist.error && (
          <p className="listing-alert-error market-wishlist-error" role="alert">
            {wishlist.error}{" "}
            <button type="button" className="market-inline-link" onClick={wishlist.clearError}>Dismiss</button>
          </p>
        )}

        {wishlistMode && (
          <>
            {savedState === "loading" && <p className="market-status" role="status">Loading your wishlist…</p>}
            {savedState === "error" && (
              <div className="market-status market-status-error" role="alert">
                <p>{savedError}</p>
                <button type="button" className="secondary" onClick={() => setReloadKey((key) => key + 1)}>Try again</button>
              </div>
            )}
            {savedState === "ready" && visibleSaved.length > 0 && (
              <div className="product-grid">
                {visibleSaved.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    saved
                    onToggleSaved={(event) => toggleWishlist(listing.id, event)}
                    onOpen={() => go(`/product/${listing.id}`)}
                  />
                ))}
              </div>
            )}
            {savedState === "ready" && visibleSaved.length === 0 && (
              <div className="market-empty market-wishlist-empty">
                <p>
                  {searchTerm
                    ? `No saved listings match “${searchTerm}”.`
                    : "Your wishlist is empty. Tap the ♡ on any listing to save it here."}
                </p>
                <button type="button" className="secondary" onClick={() => setFilterId("all")}>Browse all listings</button>
              </div>
            )}
          </>
        )}

        {!wishlistMode && loadState === "loading" && <p className="market-status" role="status">Loading listings…</p>}

        {!wishlistMode && loadState === "error" && (
          <div className="market-status market-status-error" role="alert">
            <p>{loadError}</p>
            <button type="button" className="secondary" onClick={() => setReloadKey((key) => key + 1)}>Try again</button>
          </div>
        )}

        {showSamples && (
          <>
            <p className="market-sample-note">
              No student listings yet. These samples show how the marketplace will look.{" "}
              <button type="button" className="market-inline-link" onClick={() => go("/seller-hub")}>List the first item →</button>
            </p>
            <div className="product-grid">
              {products.map((product) => (
                <article
                  className={product.route ? "product-card clickable" : "product-card"}
                  key={product.name}
                  onClick={() => product.route && go(product.route)}
                >
                  <div className="image-wrap">
                    <img src={product.image} alt="" />
                    <span>{product.tag}</span>
                    <b
                      aria-label={savedItems[product.name] ? "Remove from saved" : "Save"}
                      className={savedItems[product.name] ? "wishlist-active" : ""}
                      onClick={(event) => toggleSavedItem(product.name, event)}
                    >
                      <HeartIcon filled={Boolean(savedItems[product.name])} />
                    </b>
                  </div>
                  <h3>{product.name}</h3>
                  <div className="product-seller-review">
                    <span>{product.seller}</span>
                    <span> | <b>★ {product.rating}</b> · {product.reviews} reviews</span>
                  </div>
                  <div className="price">
                    <strong>{product.price}</strong>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {!wishlistMode && loadState === "ready" && !showSamples && listings.length > 0 && (
          <div className="product-grid">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                saved={wishlist.isSaved(listing.id)}
                onToggleSaved={(event) => toggleWishlist(listing.id, event)}
                onOpen={() => go(`/product/${listing.id}`)}
              />
            ))}
          </div>
        )}

        {!wishlistMode && loadState === "ready" && !showSamples && listings.length === 0 && (
          <p className="market-empty">
            {searchTerm ? `No listings match “${searchTerm}”. Try another search.` : "No listings here yet. Check back soon."}
          </p>
        )}

        {!wishlistMode && loadState === "ready" && hasMore && (
          <button className="secondary centered" type="button" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Loading…" : `Load ${Math.min(MARKET_PAGE_SIZE, total - listings.length)} More Listings`}
          </button>
        )}
      </section>
    </main>
  )
}

// The original hard-coded product page is kept as a demo; the landing page and sample cards link to it.
const DEMO_PRODUCT_ID = "sony-wh-1000xm4"

type ProductViewModel = {
  listingId: string | null
  isOwner: boolean
  isDemo: boolean
  title: string
  shortTitle: string
  marketplaceLabel: string
  category: string
  statusLine: string
  typeLabel: string
  campus: string
  displayPrice: string
  priceAmount: string
  priceUnit: string
  priceNote: string
  condition: string
  images: string[]
  imageAlt: string
  description: string[]
  details: Array<[string, string]>
  primaryActionLabel: string
  locationLine: string
  seller: { name: string; avatarUrl: string; subtitle: string; mobileSubtitle: string; rating: string | null }
  pickupHeading: string
  pickupNote: string
  pickupSpots: string[]
  mobilePickupTitle: string
  mobilePickupNote: string
  related: Array<{ name: string; price: string; image: string }>
}

const demoProductView: ProductViewModel = {
  listingId: null,
  isOwner: false,
  isDemo: true,
  title: "Sony WH-1000XM4 Headphones",
  shortTitle: "Sony WH-1000XM4",
  marketplaceLabel: "Stanford Marketplace",
  category: "Audio & Electronics",
  statusLine: "● Active Listing · Verified Campus Peer",
  typeLabel: "For Sale",
  campus: "PES University",
  displayPrice: "₹11,500",
  priceAmount: "₹11,500",
  priceUnit: "INR",
  priceNote: "9.5/10 · Below Student Retail",
  condition: "Like New",
  images: ["/assets/571b1.png", "/assets/26d42.png", "/assets/afa96.png", "/assets/243c2.png", "/assets/e4681.png"],
  imageAlt: "Sony WH-1000XM4 headphones",
  description: [
    "Used for one semester exclusively during quiet finals prep in Green Library. The active noise cancellation and Speak-to-Chat functionality remain completely flawless. Battery life benchmarks at roughly 28 full hours on a single charge.",
    "Includes the official Sony hard travel shell case, USB-C fast-charging cable, 3.5mm braided gold auxiliary lead, and airplane dongle.",
  ],
  details: [
    ["Condition", "Like New"],
    ["Category", "Audio & Electronics"],
    ["Listing type", "For Sale"],
    ["Brand", "Sony"],
    ["Model", "WH-1000XM4"],
    ["Availability", "Available this week"],
    ["Pickup", "Tresidder Memorial Union / Old Union Courtyard"],
  ],
  primaryActionLabel: "Buy Now · Hold for Campus Pickup",
  locationLine: "Pickup available near Green Library · Verified student seller",
  seller: { name: "Julian K.", avatarUrl: "/assets/9db3a.png", subtitle: "Junior · Symbolic Systems", mobileSubtitle: "Verified student · Symbolic Systems", rating: "★ 4.9" },
  pickupHeading: "Recommended Handoff Spots",
  pickupNote: "Meet at student-frequented public locations with power outlets for testing.",
  pickupSpots: ["Tresidder Memorial Union", "Old Union Courtyard"],
  mobilePickupTitle: "Tresidder Memorial Union",
  mobilePickupNote: "Meet near the main lobby entrance · Approximate campus pickup",
  related: [
    { name: "Fujifilm X-T30 II Camera", price: "₹2,300/day", image: "/assets/9d09f.png" },
    { name: "MacBook Air 13-inch", price: "₹58,000", image: "/assets/d07b8.png" },
    { name: "Herman Miller Sayl Task Chair", price: "₹18,000", image: "/assets/d07b8.png" },
  ],
}

function listingToView(listing: Listing): ProductViewModel {
  const isRent = listing.listingType === "for_rent"
  const seller = listing.seller
  const pickupFallback = "Arrange the exact time and spot with the seller."
  const details: Array<[string, string]> = [
    ["Condition", listing.condition || "Not specified"],
    ["Category", listing.category || "Other"],
    ["Listing type", listingTypeLabel(listing)],
  ]
  if (isRent) details.push(["Rental rate", formatListingPrice(listing)])
  if (isRent && listing.price) details.push(["Buy price", formatInr(listing.price)])
  if (listing.availability) details.push(["Availability", listing.availability])
  if (listing.exchangeFor) details.push(["Open to exchange for", listing.exchangeFor])
  details.push(["Preferred pickup location", listing.pickupLocation || "Arrange with the seller"])

  const title = listing.title || "Untitled listing"
  return {
    listingId: listing.id,
    isOwner: listing.isOwner,
    isDemo: false,
    title,
    shortTitle: title,
    marketplaceLabel: `${listing.campus || "Campus"} Marketplace`,
    category: listing.category || "Other",
    statusLine: `● ${statusLabel(listing.status)} listing${listing.campus ? ` · ${listing.campus}` : ""}`,
    typeLabel: listingTypeLabel(listing),
    campus: listing.campus,
    displayPrice: formatListingPrice(listing),
    priceAmount: formatInr(isRent ? listing.rentalPrice : listing.price),
    priceUnit: isRent ? `INR ${rentalSuffix(listing).trim()}` : "INR",
    priceNote: listing.condition ? `${listing.condition} condition` : "",
    condition: listing.condition,
    images: orderedImageUrls(listing),
    imageAlt: title,
    description: listing.description ? listing.description.split(/\n{2,}/) : ["The seller hasn't added a description yet."],
    details,
    primaryActionLabel: isRent ? "Request to Rent" : "Buy Now",
    locationLine: `${listing.pickupLocation ? `Pickup: ${listing.pickupLocation}` : "Campus pickup"} · Verified student seller`,
    seller: {
      name: seller.name,
      avatarUrl: seller.avatarUrl,
      subtitle: [seller.year, seller.course].filter(Boolean).join(" · ") || seller.college,
      mobileSubtitle: `Verified student${seller.course ? ` · ${seller.course}` : ""}`,
      rating: null,
    },
    pickupHeading: "Preferred pickup location",
    pickupNote: listing.pickupInstructions || pickupFallback,
    pickupSpots: listing.pickupLocation ? [listing.pickupLocation] : [],
    mobilePickupTitle: listing.pickupLocation || "Campus pickup",
    mobilePickupNote: listing.pickupInstructions || pickupFallback,
    related: [],
  }
}

type ProductLoad = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; view: ProductViewModel }

function Product({ go, navigate, listingId }: { go: (route: Route) => void; navigate: (href: string) => void; listingId: string }) {
  const { status: authStatus } = useAuth()
  const isDemo = listingId === DEMO_PRODUCT_ID
  const [load, setLoad] = useState<ProductLoad>(() => (isDemo ? { status: "ready", view: demoProductView } : { status: "loading" }))

  useEffect(() => {
    // Wait for sign-in to settle so owners get their own drafts on the first request.
    if (isDemo || authStatus === "loading") return
    let cancelled = false
    setLoad({ status: "loading" })
    fetchListing(listingId)
      .then((listing) => { if (!cancelled) setLoad({ status: "ready", view: listingToView(listing) }) })
      .catch((error: unknown) => {
        if (!cancelled) setLoad({ status: "error", message: error instanceof Error ? error.message : "We couldn't load this listing." })
      })
    return () => { cancelled = true }
  }, [isDemo, listingId, authStatus])

  if (load.status === "loading") {
    return <main className="page-shell"><p className="market-status" role="status">Loading listing…</p></main>
  }
  if (load.status === "error") {
    return (
      <main className="page-shell">
        <div className="market-status market-status-error" role="alert">
          <h1>Listing unavailable</h1>
          <p>{load.message}</p>
          <button type="button" className="primary" onClick={() => go("/marketplace")}>Back to marketplace</button>
        </div>
      </main>
    )
  }
  return <ProductView go={go} navigate={navigate} view={load.view} />
}

function ProductView({ go, navigate, view }: { go: (route: Route) => void; navigate: (href: string) => void; view: ProductViewModel }) {
  const isMobile = useIsMobile()
  const galleryImages = view.images
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [expandedDescription, setExpandedDescription] = useState(false)
  const wishlist = useWishlist()
  const [demoSaved, setDemoSaved] = useState(false)
  // Real listings are saved to the student's wishlist; the sample listing only toggles locally.
  const canWishlist = Boolean(view.listingId) && !view.isDemo && !view.isOwner
  const saved = canWishlist && view.listingId ? wishlist.isSaved(view.listingId) : demoSaved
  const toggleSaved = () => {
    if (!canWishlist || !view.listingId) {
      setDemoSaved((previous) => !previous)
      return
    }
    void wishlist.toggle(view.listingId).then((result) => {
      if (result === "sign-in") go("/sign-in")
    })
  }
  const sellerFirstName = view.seller.name.split(" ")[0] || "seller"

  const [offerOpen, setOfferOpen] = useState(false)
  const { status: viewerStatus } = useAuth()

  // Saves a real offer in the buyer's conversation with the seller, then opens that chat.
  const submitOffer = async (amount: number, note: string) => {
    if (view.isDemo || !view.listingId) {
      go("/messages")
      return
    }
    if (viewerStatus !== "ready") {
      go("/sign-in")
      return
    }
    const conversation = await startConversation(view.listingId)
    await createOffer(conversation.id, amount, note)
    navigate(`/messages?conversation=${encodeURIComponent(conversation.id)}`)
  }

  // Opens (or creates) the real conversation with this listing's seller. The sample listing has no seller.
  // An optional draft (buy request or offer) is pre-filled in the reply box for the buyer to send.
  const openSellerMessages = (draft?: string) => {
    if (view.isDemo || !view.listingId) {
      go("/messages")
      return
    }
    const params = new URLSearchParams({ listing: view.listingId })
    if (draft) params.set("draft", draft)
    navigate(`/messages?${params.toString()}`)
  }

  const buyDraft = view.typeLabel.toLowerCase().includes("rent")
    ? `Hi! I'd like to rent "${view.title}" (${view.displayPrice}). When is it available for pickup?`
    : `Hi! I'd like to buy "${view.title}" for ${view.displayPrice}. When can we meet for pickup?`

  const editListing = () => {
    if (view.listingId) navigate(`/seller-hub?edit=${encodeURIComponent(view.listingId)}`)
  }

  const shareProduct = async () => {
    const shareUrl = window.location.href

    if (navigator.share) {
      try {
        await navigator.share({
          title: view.title,
          text: "Check out this listing on Barterman.",
          url: shareUrl,
        })
        return
      } catch {
        // Ignore share cancelation and fall back to copy.
      }
    }

    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl)
        return
      } catch {
        // Ignore clipboard failure.
      }
    }
  }

  const mobileDescription = view.description.join(" ")
  const mainImage = galleryImages[activeImageIndex] ?? galleryImages[0]

  if (isMobile) {
    return (
      <main className="page-shell mobile-product-page-shell">
        <header className="mobile-product-header">
          <button type="button" className="mobile-product-back" onClick={() => go("/marketplace")} aria-label="Back to marketplace">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="mobile-product-header-actions">
            <button type="button" className="icon-button" aria-label="Search listings" onClick={() => go("/marketplace")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="6" />
                <path d="M16 16l5 5" />
              </svg>
            </button>
            <button type="button" className="icon-button" aria-label="Product actions">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="5.5" r="1.2" />
                <circle cx="12" cy="12" r="1.2" />
                <circle cx="12" cy="18.5" r="1.2" />
              </svg>
            </button>
          </div>
        </header>

        <div className="mobile-product-gallery">
          {galleryImages.length ? (
            <>
              <div className="mobile-gallery-track" style={{ transform: `translateX(-${activeImageIndex * 100}%)` }}>
                {galleryImages.map((src) => (
                  <img key={src} src={src} alt={view.imageAlt} />
                ))}
              </div>
              {galleryImages.length > 1 && (
                <div className="mobile-gallery-dots" aria-label="Image pagination">
                  {galleryImages.map((src, index) => (
                    <button
                      key={`${src}-${index}`}
                      type="button"
                      className={index === activeImageIndex ? "dot active" : "dot"}
                      onClick={() => setActiveImageIndex(index)}
                      aria-label={`View image ${index + 1}`}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="product-image-empty">No photos yet</div>
          )}
        </div>

        <section className="mobile-product-info">
          <div className="mobile-product-topline">
            <span className="mobile-product-tag">{view.typeLabel}</span>
            <span className="mobile-product-campus">{view.campus}</span>
          </div>
          <h1>{view.title}</h1>
          <div className="mobile-price-row">
            <strong>{view.displayPrice}</strong>
            <span>{view.condition}</span>
          </div>
          <div className="mobile-seller-location">
            <span className="dot-indicator" />
            <p>{view.locationLine}</p>
          </div>
        </section>

        {!view.isOwner && (
          <section className="mobile-message-card">
            <div className="mobile-message-card-header">
              <span className="mobile-message-icon" aria-hidden="true">✉</span>
              <strong>Message Seller</strong>
            </div>
            <div className="mobile-message-box">
              <p>Hi, is this item still available?</p>
            </div>
            <button type="button" className="mobile-primary-button" onClick={() => openSellerMessages()}>Send</button>
          </section>
        )}

        <section className="mobile-actions-row">
          {view.isOwner ? (
            <>
              <button type="button" className="mobile-action-button" onClick={editListing}>
                <span className="mobile-action-icon" aria-hidden="true">✎</span>
                <small>Edit</small>
              </button>
              <button type="button" className="mobile-action-button" onClick={() => go("/seller-hub")}>
                <span className="mobile-action-icon" aria-hidden="true">▣</span>
                <small>Seller Hub</small>
              </button>
            </>
          ) : (
            <>
              <button type="button" className="mobile-action-button" onClick={toggleSaved} aria-pressed={saved}>
                <span className={saved ? "mobile-action-icon saved" : "mobile-action-icon"} aria-hidden="true">♡</span>
                <small>{saved ? "Saved" : "Save"}</small>
              </button>
              <button type="button" className="mobile-action-button" onClick={() => setOfferOpen((open) => !open)} aria-expanded={offerOpen}>
                <span className="mobile-action-icon" aria-hidden="true">₹</span>
                <small>Offer</small>
              </button>
            </>
          )}
          <button type="button" className="mobile-action-button" onClick={shareProduct}>
            <span className="mobile-action-icon" aria-hidden="true">↗</span>
            <small>Share</small>
          </button>
        </section>

        {!view.isOwner && offerOpen && (
          <section className="mobile-section-block">
            <OfferForm view={view} onSubmit={submitOffer} onCancel={() => setOfferOpen(false)} />
          </section>
        )}

        <section className="mobile-section-block">
          <div className="mobile-section-header">
            <h2>Description</h2>
          </div>
          <p className={expandedDescription ? "mobile-description expanded" : "mobile-description collapsed"}>
            {mobileDescription}
          </p>
          <button type="button" className="mobile-inline-button" onClick={() => setExpandedDescription((previous) => !previous)}>
            {expandedDescription ? "See less" : "See more"}
          </button>
        </section>

        <section className="mobile-section-block">
          <div className="mobile-section-header">
            <h2>Seller</h2>
          </div>
          <div className="mobile-seller-row">
            <Avatar src={view.seller.avatarUrl} name={view.seller.name} alt={view.seller.name} />
            <div>
              <strong>{view.seller.name}</strong>
              <p>{view.seller.mobileSubtitle}</p>
            </div>
          </div>
          {view.isDemo && <button type="button" className="mobile-text-link" onClick={() => go("/profile")}>View profile</button>}
        </section>

        <section className="mobile-section-block">
          <div className="mobile-section-header">
            <h2>Product details</h2>
          </div>
          <dl className="mobile-details-list">
            {view.details.map(([label, value]) => (
              <div key={label} className="mobile-detail-row">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={view.related.length ? "mobile-section-block" : "mobile-section-block related-listings-section"}>
          <div className="mobile-section-header">
            <h2>Pickup location</h2>
          </div>
          <div className="mobile-location-card">
            <div className="mobile-location-pin" aria-hidden="true">⌂</div>
            <div>
              <strong>{view.mobilePickupTitle}</strong>
              <p>{view.mobilePickupNote}</p>
            </div>
          </div>
        </section>

        {view.related.length > 0 && (
          <section className="mobile-section-block related-listings-section">
            <div className="mobile-section-header">
              <h2>Related listings</h2>
            </div>
            <div className="mobile-related-row">
              {view.related.map((item) => (
                <button key={item.name} type="button" className="mobile-related-card" onClick={() => go(`/product/${DEMO_PRODUCT_ID}`)}>
                  <img src={item.image} alt={item.name} />
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.price}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="mobile-product-sticky-bar">
          <div className="mobile-sticky-price">
            <span>Price</span>
            <strong>{view.displayPrice}</strong>
          </div>
          {view.isOwner
            ? <button type="button" className="mobile-primary-button" onClick={editListing}>Edit listing</button>
            : <button type="button" className="mobile-primary-button" onClick={() => openSellerMessages()}>Message Seller</button>}
        </div>
      </main>
    )
  }

  return (
    <main className="page-shell pdp">
      <nav className="breadcrumb pdp-breadcrumb" aria-label="Breadcrumb">
        <button onClick={() => go("/marketplace")}>Marketplace</button>
        <span aria-hidden="true">/</span>
        <span>{view.category}</span>
        <span aria-hidden="true">/</span>
        <strong>{view.shortTitle}</strong>
      </nav>
      <div className="pdp-layout">
        <section className="pdp-main">
          <div className="pdp-gallery">
            {mainImage ? <img src={mainImage} alt={view.imageAlt} /> : <div className="product-image-empty">No photos yet</div>}
            {galleryImages.length > 1 && <span className="pdp-photo-count">{activeImageIndex + 1} / {galleryImages.length}</span>}
          </div>
          {galleryImages.length > 1 && (
            <div className="pdp-thumbs" aria-label="Photos">
              {galleryImages.map((src, index) => (
                <button
                  key={src}
                  type="button"
                  className={index === activeImageIndex ? "active" : undefined}
                  onClick={() => setActiveImageIndex(index)}
                  aria-label={`Show photo ${index + 1}`}
                  aria-pressed={index === activeImageIndex}
                >
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          )}
          <article className="pdp-card">
            <h2>Description</h2>
            <div className="pdp-description">
              {view.description.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </article>
          <article className="pdp-card">
            <h2>Item details</h2>
            <dl className="pdp-details">
              {view.details.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </article>
        </section>

        <aside className="pdp-sidebar">
          <div className="pdp-card pdp-summary">
            <div className="pdp-badges">
              <span className="pdp-badge">{view.typeLabel}</span>
              {view.condition && <span className="pdp-badge pdp-badge-muted">{view.condition}</span>}
            </div>
            <h1>{view.title}</h1>
            <p className="pdp-price">
              {view.priceAmount} <small>{view.priceUnit}</small>
            </p>
            <p className="pdp-status">{view.statusLine.replace(/^●\s*/, "")}</p>
            {view.isOwner ? (
              <div className="pdp-actions">
                <button className="primary" onClick={editListing}>Edit listing</button>
                <button className="secondary" onClick={() => go("/seller-hub")}>Open Seller Hub</button>
              </div>
            ) : (
              <>
                <div className="pdp-actions">
                  <button className="primary" onClick={() => openSellerMessages(buyDraft)}>{view.primaryActionLabel}</button>
                  <button className="secondary" onClick={() => setOfferOpen((open) => !open)} aria-expanded={offerOpen}>
                    {offerOpen ? "Close offer" : "Make Offer"}
                  </button>
                </div>
                {offerOpen && <OfferForm view={view} onSubmit={submitOffer} onCancel={() => setOfferOpen(false)} />}
                <button type="button" className={`pdp-save-button${saved ? " is-saved" : ""}`} onClick={toggleSaved} aria-pressed={saved}>
                  <HeartIcon filled={saved} /> {saved ? "Saved to wishlist" : "Save to wishlist"}
                </button>
                {wishlist.error && <p className="pdp-offer-error" role="alert">{wishlist.error}</p>}
              </>
            )}
          </div>

          <div className="pdp-card pdp-seller">
            <div className="pdp-seller-row">
              <Avatar src={view.seller.avatarUrl} name={view.seller.name} />
              <div>
                <span className="pdp-label">Seller</span>
                <strong>{view.seller.name}</strong>
                <p>{view.seller.subtitle}</p>
              </div>
              {view.seller.rating && <b className="pdp-rating">{view.seller.rating}</b>}
            </div>
            {!view.isOwner && (
              <button className="pdp-message-button" onClick={() => openSellerMessages()}>
                Message {sellerFirstName}
              </button>
            )}
          </div>

          <div className="pdp-card pdp-pickup">
            <span className="pdp-label">{view.pickupHeading}</span>
            {view.pickupSpots.length > 0 ? (
              view.pickupSpots.map((spot) => <strong key={spot}>{spot}</strong>)
            ) : (
              <strong>Arrange with the seller</strong>
            )}
            <p>{view.pickupNote}</p>
          </div>

          <p className="pdp-safety">Meet in a busy spot on campus and check the item before you pay.</p>
        </aside>
      </div>
    </main>
  )
}

/** Make Offer: pick a price, then continue in chat with the offer already written for the seller. */
/** Make Offer: saves a real offer (the seller sees it in Seller Hub and in chat), then opens the chat. */
function OfferForm({ view, onSubmit, onCancel }: { view: ProductViewModel; onSubmit: (amount: number, note: string) => Promise<void>; onCancel: () => void }) {
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [sending, setSending] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = Number(amount)
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) return setError("Enter the price you'd like to offer.")
    if (!Number.isInteger(value)) return setError("Use a whole number of rupees.")
    if (value > 10_000_000) return setError("That offer is too high.")
    setSending(true)
    setError("")
    try {
      await onSubmit(value, note.trim())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't send your offer. Please try again.")
      setSending(false)
    }
  }

  return (
    <form className="pdp-offer" onSubmit={submit} noValidate>
      <label htmlFor="offer-amount">Your offer</label>
      <div className="pdp-offer-input">
        <span aria-hidden="true">₹</span>
        <input
          id="offer-amount"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          placeholder={view.priceAmount.replace(/[^\d]/g, "") || "0"}
          value={amount}
          onChange={(event) => { setAmount(event.target.value); setError("") }}
          autoFocus
        />
      </div>
      <label htmlFor="offer-note" className="pdp-offer-note-label">Note to seller <span>Optional</span></label>
      <input
        id="offer-note"
        className="pdp-offer-note"
        maxLength={300}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="e.g. Can pick up today after class"
      />
      <p className="pdp-offer-hint">Asking {view.displayPrice}. The seller can accept, decline or counter, and you'll continue in chat.</p>
      {error && <p className="pdp-offer-error" role="alert">{error}</p>}
      <div className="pdp-offer-buttons">
        <button type="button" className="secondary" onClick={onCancel} disabled={sending}>Cancel</button>
        <button type="submit" className="primary" disabled={sending}>{sending ? "Sending…" : "Send offer"}</button>
      </div>
    </form>
  )
}

type ListingForm = {
  title: string
  price: string
  category: string
  condition: string
  description: string
  listingType: ListingType
  rentalPrice: string
  rentalDuration: string
  availability: string
  exchangeFor: string
  campus: string
  pickupLocation: string
  pickupInstructions: string
}

/** A photo in the editor: already saved in Cloudinary (publicId) or a new local file (file + blob URL). */
type ListingPhoto = {
  id: string
  url: string
  fileName: string
  isPrimary: boolean
  file?: File
  publicId?: string
}

type SaveMode = "draft" | "publish"

const MAX_LISTING_PHOTOS = 10
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

function storedCampus() {
  try {
    return window.localStorage.getItem("barterman-campus") || ""
  } catch {
    return ""
  }
}

function emptyListingForm(campus: string): ListingForm {
  return {
    title: "",
    price: "",
    category: "",
    condition: "",
    description: "",
    listingType: "for_sale",
    rentalPrice: "",
    rentalDuration: "Per day",
    availability: "",
    exchangeFor: "",
    campus,
    pickupLocation: "",
    pickupInstructions: "",
  }
}

function formFromListing(listing: Listing, fallbackCampus: string): ListingForm {
  return {
    title: listing.title,
    price: listing.price === null ? "" : String(listing.price),
    category: listing.category,
    condition: listing.condition,
    description: listing.description,
    listingType: listing.listingType,
    rentalPrice: listing.rentalPrice === null ? "" : String(listing.rentalPrice),
    rentalDuration: listing.rentalDuration,
    availability: listing.availability,
    exchangeFor: listing.exchangeFor,
    campus: listing.campus || fallbackCampus,
    pickupLocation: listing.pickupLocation,
    pickupInstructions: listing.pickupInstructions,
  }
}

function photosFromListing(listing: Listing): ListingPhoto[] {
  const photos = listing.images.map((image, index) => ({
    id: image.publicId,
    url: image.url,
    fileName: `${listing.title || "Listing"} photo ${index + 1}`,
    isPrimary: image.isPrimary,
    publicId: image.publicId,
  }))
  return photos.length && !photos.some((photo) => photo.isPrimary) ? photos.map((photo, index) => ({ ...photo, isPrimary: index === 0 })) : photos
}

function toListingInput(form: ListingForm, status: ListingInput["status"]): ListingInput {
  const amount = (value: string) => (value.trim() === "" ? null : Number(value))
  const isRent = form.listingType === "for_rent"
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    category: form.category,
    condition: form.condition,
    listingType: form.listingType,
    price: amount(form.price),
    rentalPrice: isRent ? amount(form.rentalPrice) : null,
    rentalDuration: form.rentalDuration,
    availability: isRent ? form.availability.trim() : "",
    exchangeFor: form.exchangeFor.trim(),
    pickupLocation: form.pickupLocation.trim(),
    pickupInstructions: form.pickupInstructions.trim(),
    status,
  }
}

function Sell({ go, listingId, onSaved }: {
  go: (route: Route) => void
  /** Edit an existing listing; omit to create a new one. */
  listingId?: string
  onSaved?: (listing: Listing, mode: SaveMode) => void
}) {
  const { user } = useAuth()
  const defaultCampus = user?.college || storedCampus()
  const [form, setForm] = useState<ListingForm>(() => emptyListingForm(defaultCampus))
  const [photos, setPhotos] = useState<ListingPhoto[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [savedListing, setSavedListing] = useState<Listing | null>(null)
  const [saving, setSaving] = useState<SaveMode | null>(null)
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null)
  const [loadState, setLoadState] = useState<"ready" | "loading" | "error">(listingId ? "loading" : "ready")
  const [loadError, setLoadError] = useState("")
  const blobUrls = useRef(new Set<string>())

  const currentListingId = savedListing?.id ?? listingId

  useEffect(() => {
    if (!listingId) return
    let cancelled = false
    setLoadState("loading")
    fetchListing(listingId)
      .then((listing) => {
        if (cancelled) return
        if (!listing.isOwner) {
          setLoadError("You can only edit your own listings.")
          setLoadState("error")
          return
        }
        setSavedListing(listing)
        setForm(formFromListing(listing, defaultCampus))
        setPhotos(photosFromListing(listing))
        setLoadState("ready")
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : "We couldn't load this listing.")
        setLoadState("error")
      })
    return () => { cancelled = true }
  }, [listingId])

  // Release local preview URLs when the editor closes.
  useEffect(() => {
    const urls = blobUrls.current
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  const releasePreview = (url: string) => {
    if (!url.startsWith("blob:")) return
    URL.revokeObjectURL(url)
    blobUrls.current.delete(url)
  }

  const categoryOptions = LISTING_CATEGORIES
  const conditionOptions = LISTING_CONDITIONS

  const coverImage = useMemo(() => photos.find((photo) => photo.isPrimary)?.url ?? photos[0]?.url ?? null, [photos])

  const updateField = <K extends keyof ListingForm>(field: K, value: ListingForm[K]) => {
    setForm((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: "" }))
  }

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = Array.from(event.target.files ?? [])
    event.target.value = ""
    if (!uploadedFiles.length) return

    const validFiles = uploadedFiles.filter((file) => file.type.startsWith("image/") && file.size <= MAX_PHOTO_BYTES)
    const messages: string[] = []
    if (validFiles.length < uploadedFiles.length) {
      messages.push("Some files were skipped because they were not valid images or exceeded 5MB.")
    }
    const remainingSlots = Math.max(0, MAX_LISTING_PHOTOS - photos.length)
    if (validFiles.length > remainingSlots) {
      messages.push(`You can upload up to ${MAX_LISTING_PHOTOS} photos for a listing.`)
    }

    const nextPhotos: ListingPhoto[] = validFiles.slice(0, remainingSlots).map((file, index) => {
      const url = URL.createObjectURL(file)
      blobUrls.current.add(url)
      return { id: `${file.name}-${Date.now()}-${index}`, url, fileName: file.name, isPrimary: false, file }
    })

    if (nextPhotos.length) {
      setPhotos((previous) => {
        const merged = [...previous, ...nextPhotos]
        return merged.some((photo) => photo.isPrimary) ? merged : merged.map((photo, index) => ({ ...photo, isPrimary: index === 0 }))
      })
    }
    setErrors((previous) => ({ ...previous, photos: messages.join(" ") }))
  }

  const removePhoto = (id: string) => {
    const target = photos.find((photo) => photo.id === id)
    if (target) releasePreview(target.url)
    setPhotos((previous) => {
      const remaining = previous.filter((photo) => photo.id !== id)
      return remaining.length && !remaining.some((photo) => photo.isPrimary)
        ? remaining.map((photo, index) => ({ ...photo, isPrimary: index === 0 }))
        : remaining
    })
  }

  const markPrimaryPhoto = (id: string) => {
    setPhotos((previous) => previous.map((photo) => ({ ...photo, isPrimary: photo.id === id })))
  }

  // Drafts need only a title; publishing needs the full listing (the server checks the same rules).
  const validate = (mode: SaveMode) => {
    const nextErrors: Record<string, string> = {}
    if (!form.title.trim()) nextErrors.title = "Add a product title to continue."
    if (mode === "draft") return nextErrors

    const price = Number(form.price)
    const rentalPrice = Number(form.rentalPrice)
    if (form.listingType === "for_sale" && (!form.price || !(price > 0))) nextErrors.price = "Enter a valid price in INR."
    if (form.listingType === "for_rent" && form.price && !(price > 0)) nextErrors.price = "Enter a valid price in INR, or leave it empty."
    if (!form.category) nextErrors.category = "Choose a category."
    if (!form.condition) nextErrors.condition = "Select the condition."
    if (!form.description.trim()) nextErrors.description = "Write a short description."
    if (!form.campus.trim()) nextErrors.campus = "Add your college to your profile first."
    if (!form.pickupLocation.trim()) nextErrors.pickupLocation = "Add a meetup preference."
    if (form.listingType === "for_rent" && (!form.rentalPrice || !(rentalPrice > 0))) {
      nextErrors.rentalPrice = "Add a rental rate."
    }
    if (!photos.length) nextErrors.photos = "Add at least one image before publishing."
    return nextErrors
  }

  const save = async (mode: SaveMode) => {
    const nextErrors = validate(mode)
    setErrors(nextErrors)
    setNotice(null)
    if (Object.keys(nextErrors).length > 0) {
      setNotice({ kind: "error", text: "Fix the highlighted fields to continue." })
      return
    }

    setSaving(mode)
    try {
      const listing = await saveListing({
        id: currentListingId,
        input: toListingInput(form, mode === "publish" ? "active" : "draft"),
        photos: photos.map((photo) => ({ file: photo.file, publicId: photo.publicId, isPrimary: photo.isPrimary })),
      })
      photos.forEach((photo) => releasePreview(photo.url))
      setSavedListing(listing)
      setPhotos(photosFromListing(listing))
      setNotice({
        kind: "success",
        text: mode === "publish" ? "Listing published. Students on your campus can now see it." : "Draft saved. Only you can see it until you publish.",
      })
      if (onSaved) onSaved(listing, mode)
      else if (mode === "publish") go(`/product/${listing.id}`)
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "We couldn't save your listing. Please try again." })
    } finally {
      setSaving(null)
    }
  }

  const progressSteps = [
    "Photos",
    "Details",
    "Offer",
    "Pickup",
    "Review",
  ]

  const isRent = form.listingType === "for_rent"
  const displayPrice = formatInr(Number(isRent ? form.rentalPrice : form.price) || 0) + (isRent ? rentalSuffix(form) : "")
  const isPublished = savedListing !== null && savedListing.status !== "draft"
  const sellerName = user?.name ?? "You"
  const busy = saving !== null

  if (loadState !== "ready") {
    return (
      <main className="page-shell listing-page-shell">
        {loadState === "loading" ? (
          <p className="market-status" role="status">Loading listing…</p>
        ) : (
          <div className="market-status market-status-error" role="alert">
            <p>{loadError}</p>
            <button type="button" className="secondary" onClick={() => go("/marketplace")}>Back to marketplace</button>
          </div>
        )}
      </main>
    )
  }

  return (
    <main className="page-shell listing-page-shell">
      <div className="listing-layout-shell">
        <aside className="listing-form-column">
          <div className="listing-form-header">
            <div className="listing-breadcrumb-row">
              <button type="button" className="listing-breadcrumb" onClick={() => go("/marketplace")}>Marketplace</button>
              <span className="listing-breadcrumb-separator">/</span>
            </div>
            <div className="listing-header-row">
              <div>
                <h1>{listingId ? "Edit listing" : "Create a listing"}</h1>
              </div>
              <button type="button" className="secondary listing-draft-button" onClick={() => void save("draft")} disabled={busy}>
                {saving === "draft" ? "Saving…" : "Save Draft"}
              </button>
            </div>
          </div>

          <div className="seller-card compact-seller-card">
            <Avatar src={user?.avatarUrl} name={sellerName} alt="Seller avatar" />
            <div>
              <strong>{sellerName}</strong>
              <p>Verified student seller</p>
            </div>
            <span className="seller-visibility">{isPublished ? "Public" : "Draft"}</span>
          </div>

          {notice && (
            notice.kind === "success"
              ? <div className="success" role="status">{notice.text}</div>
              : <div className="listing-alert-error" role="alert">{notice.text}</div>
          )}

          <div className="listing-form-scroll">
            <form id="listing-form-submit" className="listing-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void save("publish") }} noValidate>
              <section className="listing-section">
                <div className="section-heading-row">
                  <h2>Photos</h2>
                  <span>{photos.length}/{MAX_LISTING_PHOTOS}</span>
                </div>
                {errors.photos && <p className="field-error">{errors.photos}</p>}
                <div className="upload-grid">
                  {photos.map((photo) => (
                    <div key={photo.id} className={`upload-thumb ${photo.isPrimary ? "is-primary" : ""}`}>
                      <img src={photo.url} alt={photo.fileName} draggable={false} />
                      <div className="upload-thumb-actions">
                        <button type="button" className="mini-ghost" onClick={() => markPrimaryPhoto(photo.id)}>
                          {photo.isPrimary ? "Cover" : "Set cover"}
                        </button>
                        <button type="button" className="mini-danger" onClick={() => removePhoto(photo.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  {photos.length < MAX_LISTING_PHOTOS && (
                    <label className="upload-dropzone">
                      <span>＋ Add Photos</span>
                      <input type="file" accept="image/*" multiple onChange={handleImageUpload} />
                    </label>
                  )}
                </div>
              </section>

              <section className="listing-section">
                <h2>Product details</h2>
                <div className="form-grid two-column">
                  <label className="field full-width">
                    <span>Product title</span>
                    <input
                      value={form.title}
                      onChange={(event) => updateField("title", event.target.value)}
                      placeholder="Ex: Sony WH-1000XM4 Headphones"
                      maxLength={120}
                    />
                    {errors.title && <small className="field-error">{errors.title}</small>}
                  </label>

                  <label className="field">
                    <span>{isRent ? "Buy price (optional)" : "Price"}</span>
                    <div className="currency-input">
                      <span>₹</span>
                      <input
                        type="number"
                        min="0"
                        value={form.price}
                        onChange={(event) => updateField("price", event.target.value)}
                        placeholder="14500"
                      />
                    </div>
                    {errors.price && <small className="field-error">{errors.price}</small>}
                  </label>

                  <label className="field">
                    <span>Category</span>
                    <select value={form.category} onChange={(event) => updateField("category", event.target.value)}>
                      <option value="">Select category</option>
                      {categoryOptions.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                    {errors.category && <small className="field-error">{errors.category}</small>}
                  </label>

                  <label className="field">
                    <span>Condition</span>
                    <select value={form.condition} onChange={(event) => updateField("condition", event.target.value)}>
                      <option value="">Select condition</option>
                      {conditionOptions.map((condition) => (
                        <option key={condition} value={condition}>{condition}</option>
                      ))}
                    </select>
                    {errors.condition && <small className="field-error">{errors.condition}</small>}
                  </label>

                  <label className="field full-width">
                    <span>Description</span>
                    <textarea
                      value={form.description}
                      onChange={(event) => updateField("description", event.target.value)}
                      placeholder="Tell students what makes the item useful, the condition, and any included accessories."
                      maxLength={3000}
                    />
                    {errors.description && <small className="field-error">{errors.description}</small>}
                  </label>
                </div>
              </section>

              <section className="listing-section">
                <h2>Listing type</h2>
                <div className="mode-grid listing-type-grid">
                  {[
                    { value: "for_sale", label: "For Sale" },
                    { value: "for_rent", label: "For Rent" },
                  ].map((option) => (
                    <label key={option.value} className={form.listingType === option.value ? "selected" : ""}>
                      <input
                        type="radio"
                        name="listingType"
                        checked={form.listingType === option.value}
                        onChange={() => updateField("listingType", option.value as ListingType)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>

                {isRent && (
                  <div className="form-grid two-column">
                    <label className="field">
                      <span>Rental price</span>
                      <div className="currency-input">
                        <span>₹</span>
                        <input
                          type="number"
                          min="0"
                          value={form.rentalPrice}
                          onChange={(event) => updateField("rentalPrice", event.target.value)}
                        />
                      </div>
                      {errors.rentalPrice && <small className="field-error">{errors.rentalPrice}</small>}
                    </label>
                    <label className="field">
                      <span>Rental duration</span>
                      <select value={form.rentalDuration} onChange={(event) => updateField("rentalDuration", event.target.value)}>
                        {RENTAL_DURATIONS.map((duration) => <option key={duration}>{duration}</option>)}
                      </select>
                    </label>
                    <label className="field full-width">
                      <span>Availability</span>
                      <input
                        value={form.availability}
                        onChange={(event) => updateField("availability", event.target.value)}
                        placeholder="Ex: Available this week after 5PM"
                        maxLength={200}
                      />
                    </label>
                  </div>
                )}
              </section>

              <section className="listing-section">
                <h2>Campus and meetup</h2>
                <div className="form-grid two-column">
                  <label className="field">
                    <span>Campus</span>
                    <div className="locked-campus" aria-live="polite">{form.campus || "Add your college to your profile"}</div>
                    {errors.campus && <small className="field-error">{errors.campus}</small>}
                  </label>

                  <label className="field">
                    <span>Meetup preference</span>
                    <input
                      value={form.pickupLocation}
                      onChange={(event) => updateField("pickupLocation", event.target.value)}
                      placeholder="Main library foyer, student plaza, etc."
                      maxLength={200}
                    />
                    {errors.pickupLocation && <small className="field-error">{errors.pickupLocation}</small>}
                  </label>

                  <label className="field full-width">
                    <span>Meetup instructions</span>
                    <textarea
                      value={form.pickupInstructions}
                      onChange={(event) => updateField("pickupInstructions", event.target.value)}
                      placeholder="Optional: mention parking, meet-up times, or instructions for a safe handoff."
                      maxLength={1000}
                    />
                  </label>
                </div>
              </section>

              <section className="listing-section review-section">
                <h2>Review</h2>
                <div className="review-summary">
                  <div>
                    <span>Title</span>
                    <strong>{form.title || "Title"}</strong>
                  </div>
                  <div>
                    <span>Price</span>
                    <strong>{displayPrice}</strong>
                  </div>
                  <div>
                    <span>Campus</span>
                    <strong>{form.campus || "Campus"}</strong>
                  </div>
                  <div>
                    <span>Meetup</span>
                    <strong>{form.pickupLocation || "Meetup preference"}</strong>
                  </div>
                </div>
              </section>
            </form>
          </div>

          <div className="listing-form-footer">
            <div className="progress-track" aria-label="Listing progress">
              {progressSteps.map((step, index) => (
                <span key={step} className={index < 3 ? "active" : ""}>{step}</span>
              ))}
            </div>
            <div className="listing-form-actions">
              <button type="button" className="secondary" onClick={() => go("/marketplace")} disabled={busy}>Back</button>
              <button type="button" className="secondary" onClick={() => void save("draft")} disabled={busy}>
                {saving === "draft" ? "Saving…" : "Save Draft"}
              </button>
              <button type="submit" className="primary" form="listing-form-submit" disabled={busy}>
                {saving === "publish" ? "Publishing…" : isPublished ? "Update listing" : "Publish listing"}
              </button>
            </div>
          </div>
        </aside>

        <aside className="listing-preview-column">
          <div className="listing-preview-wrap">
            <div className="preview-panel-header">
              <span>Preview</span>
            </div>
            <div className="listing-preview-card">
              <div className="preview-image-panel">
                {coverImage ? (
                  <>
                    <img src={coverImage} alt={form.title || "Preview product"} className="preview-main-image" />
                    <div className="preview-thumbs">
                      {photos.slice(0, 4).map((photo) => (
                        <img key={photo.id} src={photo.url} alt={photo.fileName} className={photo.url === coverImage ? "active" : ""} />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="preview-empty-state">
                    <p>Your product image will appear here.</p>
                  </div>
                )}
              </div>

              <div className="preview-details-panel">
                <div className="preview-meta-row">
                  <span>{form.category || "Category"}</span>
                  <span className="verified-pill">Verified</span>
                </div>
                <h3>{form.title || "Title"}</h3>
                <div className="preview-price-row">
                  <strong>{displayPrice}</strong>
                  <span>{form.condition || "Condition"}</span>
                </div>
                <div className="preview-badges-row">
                  <span>{isRent ? "For rent" : "For sale"}</span>
                  <span>{form.campus || "Campus"}</span>
                </div>
                <p className="preview-description">
                  {form.description || "Description will appear here."}
                </p>
                <div className="preview-seller-row">
                  <Avatar src={user?.avatarUrl} name={sellerName} alt="Seller" />
                  <div>
                    <strong>{sellerName}</strong>
                    <span>Verified student</span>
                  </div>
                </div>
                <div className="preview-location-box">
                  <strong>Meetup</strong>
                  <span>{form.pickupLocation || "Meetup preference"}</span>
                </div>
                <button
                  className="primary preview-button"
                  type="button"
                  disabled={!savedListing}
                  onClick={() => savedListing && go(`/product/${savedListing.id}`)}
                >
                  {savedListing ? "View product" : "Save to preview"}
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}

type SellerHubTab =
  | "Overview"
  | "My Listings"
  | "Create Listing"
  | "Offers & Negotiations"
  | "Orders & Rentals"
  | "Messages"
  | "AI Seller Assistant"
  | "Earnings & Activity"
  | "Settings"

const sellerHubNavItems: Array<{ label: SellerHubTab; hint: string; icon: string }> = [
  { label: "Overview", hint: "Summary", icon: "⌂" },
  { label: "My Listings", hint: "Inventory", icon: "▣" },
  { label: "Create Listing", hint: "New item", icon: "+" },
  { label: "Offers & Negotiations", hint: "Deals", icon: "◌" },
  { label: "Orders & Rentals", hint: "Transactions", icon: "◫" },
  { label: "Messages", hint: "Inbox", icon: "✉" },
  { label: "AI Seller Assistant", hint: "Automation", icon: "✦" },
  { label: "Earnings & Activity", hint: "Reports", icon: "◔" },
  { label: "Settings", hint: "Account", icon: "⚙" },
]


const SELLER_LISTING_FILTERS: Array<{ value: "All" | ListingStatus; label: string }> = [
  { value: "All", label: "All" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Drafts" },
  { value: "pending", label: "Pending" },
  { value: "sold", label: "Sold" },
  { value: "rented", label: "Rented" },
  { value: "archived", label: "Archived" },
]

function SellerHub({ go, navigate }: { go: (route: Route) => void; navigate: (href: string) => void }) {
  const isMobile = useIsMobile()
  const { user } = useAuth()
  const sellerName = user?.name ?? "Seller"
  const [activeTab, setActiveTab] = useState<SellerHubTab>("Overview")
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [listings, setListings] = useState<Listing[]>([])
  const [listingsState, setListingsState] = useState<"loading" | "ready" | "error">("loading")
  const [listingsError, setListingsError] = useState("")
  const [listingActionError, setListingActionError] = useState("")
  const [busyListingId, setBusyListingId] = useState<string | null>(null)
  const [reloadListings, setReloadListings] = useState(0)
  const [listingFilter, setListingFilter] = useState<"All" | ListingStatus>("All")
  // The Create Listing tab edits this listing, or creates a new one when null.
  const [editingListingId, setEditingListingId] = useState<string | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const [assistantEnabled, setAssistantEnabled] = useState(true)
  const [minAcceptablePrice, setMinAcceptablePrice] = useState("12000")
  const [negotiationLimit, setNegotiationLimit] = useState("15%")
  const [availability, setAvailability] = useState("Available after 5pm on weekdays")
  const [preferredResponses, setPreferredResponses] = useState("Keep answers short, confirm the condition, and mention pickup timing clearly.")

  useEffect(() => {
    if (typeof document === "undefined") return

    if (!isMobile) {
      document.body.style.overflow = ""
      setMobileMenuOpen(false)
      return
    }

    document.body.style.overflow = mobileMenuOpen ? "hidden" : ""

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = ""
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [isMobile, mobileMenuOpen])

  useEffect(() => {
    let cancelled = false
    setListingsState("loading")
    fetchMyListings()
      .then((items) => {
        if (cancelled) return
        setListings(items)
        setListingsState("ready")
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setListingsError(error instanceof Error ? error.message : "We couldn't load your listings.")
        setListingsState("error")
      })
    return () => { cancelled = true }
  }, [reloadListings])

  const openEditor = (listingId: string | null) => {
    setEditingListingId(listingId)
    setEditorKey((key) => key + 1)
    setActiveTab("Create Listing")
    setMobileMenuOpen(false)
  }

  // A product page's "Edit listing" links here with ?edit=<id>.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const editId = params.get("edit")
    if (!editId) return
    openEditor(editId)
    params.delete("edit")
    const query = params.toString()
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`)
  }, [])

  const selectTab = (tab: SellerHubTab) => {
    if (tab === "Create Listing") return openEditor(null)
    setActiveTab(tab)
    setMobileMenuOpen(false)
  }

  const filteredListings = useMemo(
    () =>
      listingFilter === "All"
        ? listings
        : listings.filter((listing) => listing.status === listingFilter),
    [listingFilter, listings],
  )

  const activeListingCount = listings.filter((listing) => listing.status === "active").length
  const soldItemCount = listings.filter((listing) => listing.status === "sold").length
  const draftCount = listings.filter((listing) => listing.status === "draft").length
  const [pendingOfferCount, setPendingOfferCount] = useState<number | null>(null)
  useEffect(() => {
    fetchReceivedOffers("pending").then(({ pendingCount }) => setPendingOfferCount(pendingCount)).catch(() => {})
  }, [])
  // Overview "Recent activity": the seller's own listings, most recently changed first.
  const recentListings = useMemo(
    () => [...listings].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()).slice(0, 5),
    [listings],
  )
  const { unreadTotal: unreadBuyerMessages } = useRealtime()

  const changeListingStatus = async (listingId: string, nextStatus: Exclude<ListingStatus, "draft">) => {
    setBusyListingId(listingId)
    setListingActionError("")
    try {
      const updated = await updateListingStatus(listingId, nextStatus)
      setListings((current) => current.map((listing) => (listing.id === listingId ? updated : listing)))
    } catch (error) {
      setListingActionError(error instanceof Error ? error.message : "We couldn't update that listing.")
    } finally {
      setBusyListingId(null)
    }
  }

  const removeListing = async (listing: Listing) => {
    if (!window.confirm(`Delete “${listing.title || "this listing"}”? Its photos are deleted too. This can't be undone.`)) return
    setBusyListingId(listing.id)
    setListingActionError("")
    try {
      await deleteListing(listing.id)
      setListings((current) => current.filter((item) => item.id !== listing.id))
    } catch (error) {
      setListingActionError(error instanceof Error ? error.message : "We couldn't delete that listing.")
    } finally {
      setBusyListingId(null)
    }
  }

  const handleListingSaved = (listing: Listing, mode: "draft" | "publish") => {
    setListings((current) => [listing, ...current.filter((item) => item.id !== listing.id)])
    if (mode === "publish") {
      setEditingListingId(null)
      setListingFilter("All")
      setActiveTab("My Listings")
    }
  }

  const renderOverview = () => (
    <div className="seller-dashboard-section">
      <div className="seller-hero-panel">
        <div>
          <span className="eyebrow">Seller Hub</span>
          <h1>Welcome back, {sellerName.split(" ")[0]}</h1>
          <p>Manage every campus listing, offer, and handoff in one place.</p>
        </div>
        <div className="seller-hero-actions">
          <button className="primary" onClick={() => openEditor(null)}>Create Listing</button>
          <button className="secondary" onClick={() => go("/messages")}>Open Inbox</button>
        </div>
      </div>

      <div className="seller-metric-grid">
        <article className="seller-metric-card">
          <span>Total active listings</span>
          <strong>{activeListingCount}</strong>
          <small>Live on campus</small>
        </article>
        <article className="seller-metric-card">
          <span>Total sold items</span>
          <strong>{soldItemCount}</strong>
          <small>Completed sales</small>
        </article>
        <button type="button" className="seller-metric-card sh-metric-button" onClick={() => setActiveTab("Offers & Negotiations")}>
          <span>Pending offers</span>
          <strong>{pendingOfferCount ?? "–"}</strong>
          <small>{draftCount ? `${draftCount} draft${draftCount === 1 ? "" : "s"} not published` : "Awaiting your reply"}</small>
        </button>
        <article className="seller-metric-card">
          <span>Unread buyer messages</span>
          <strong>{unreadBuyerMessages}</strong>
          <small>Needs attention</small>
        </article>
      </div>

      <div className="seller-two-column-layout">
        <section className="seller-panel">
          <div className="seller-panel-header">
            <h2>Recent activity</h2>
            <button className="ghost-button" onClick={() => setActiveTab("My Listings")}>View all</button>
          </div>

          {listingsState === "loading" && <div className="seller-empty-block" role="status">Loading your listings…</div>}
          {listingsState === "error" && <div className="seller-empty-block" role="alert">{listingsError}</div>}
          {listingsState === "ready" && (recentListings.length ? (
            <div className="seller-transaction-list">
              {recentListings.map((listing) => (
                <button
                  key={listing.id}
                  type="button"
                  className="seller-transaction-item sh-activity-item"
                  onClick={() => (listing.status === "draft" ? openEditor(listing.id) : go(`/product/${listing.id}`))}
                >
                  <div>
                    <strong>{listing.title || "Untitled draft"}</strong>
                    <span>
                      {listingTypeLabel(listing)}
                      {listing.price !== null || listing.rentalPrice !== null ? ` · ${formatListingPrice(listing)}` : ""}
                      {listing.status !== "draft" ? ` · ${listing.views} view${listing.views === 1 ? "" : "s"}` : ""}
                    </span>
                  </div>
                  <div>
                    <span className="seller-status-badge">{statusLabel(listing.status)}</span>
                    <small>{new Date(listing.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</small>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="seller-empty-block">
              No activity yet. <button type="button" className="market-inline-link" onClick={() => openEditor(null)}>Create your first listing →</button>
            </div>
          ))}
        </section>

        <section className="seller-panel">
          <div className="seller-panel-header">
            <h2>AI seller helper</h2>
            <button className="ghost-button" onClick={() => setActiveTab("AI Seller Assistant")}>Configure</button>
          </div>
          <div className="seller-assistant-preview">
            <p><strong>Assistant status:</strong> {assistantEnabled ? "Enabled" : "Disabled"}</p>
            <div className="assistant-preview-box">
              <small>Buyer</small>
              <p>Is the chair still available today?</p>
            </div>
            <div className="assistant-preview-box assistant-reply">
              <small>AI reply preview</small>
              <p>It is available this evening. Pickup can be arranged near the library after 5pm.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )

  const renderListings = () => (
    <div className="seller-dashboard-section">
      <div className="seller-section-header">
        <div>
          <span className="eyebrow">Inventory</span>
          <h1>My Listings</h1>
        </div>
        <button className="primary" onClick={() => openEditor(null)}>Create Listing</button>
      </div>

      <div className="seller-toolbar-row">
        <div className="seller-filter-tabs">
          {SELLER_LISTING_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={listingFilter === filter.value ? "active" : ""}
              aria-pressed={listingFilter === filter.value}
              onClick={() => setListingFilter(filter.value)}
            >
              {filter.label}
              {listingsState === "ready" && (
                <span className="sh-filter-count">
                  {filter.value === "All" ? listings.length : listings.filter((listing) => listing.status === filter.value).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {listingActionError && <p className="listing-alert-error" role="alert">{listingActionError}</p>}

      <div className="sh-grid">
        {listingsState === "loading" && <div className="seller-empty-block seller-span-full" role="status">Loading your listings…</div>}

        {listingsState === "error" && (
          <div className="seller-empty-block seller-span-full" role="alert">
            <p>{listingsError}</p>
            <button className="secondary" type="button" onClick={() => setReloadListings((key) => key + 1)}>Try again</button>
          </div>
        )}

        {listingsState === "ready" && (filteredListings.length ? (
          filteredListings.map((listing) => {
            const busy = busyListingId === listing.id
            const cover = primaryImageUrl(listing)
            const canRelist = Boolean(listing.publishedAt) && listing.status !== "active" && listing.status !== "draft"
            const isRental = listing.listingType === "for_rent"
            // Rentals can be marked rented; sales (or rentals that also have a buy price) can be marked sold.
            const canMarkSold = listing.status === "active" && (!isRental || Boolean(listing.price))
            const canMarkRented = listing.status === "active" && isRental
            const canArchive = listing.status !== "archived" && listing.status !== "draft"
            return (
              <article key={listing.id} className="sh-card">
                <div className="sh-card-image">
                  {cover ? <img src={cover} alt="" loading="lazy" /> : <div className="sh-card-noimage">No photo</div>}
                  <span className={`sh-status sh-status-${listing.status}`}>{statusLabel(listing.status)}</span>
                </div>
                <div className="sh-card-body">
                  <div className="sh-card-meta">
                    <span>{listingTypeLabel(listing)}</span>
                    {listing.status !== "draft" && <span>{listing.views} view{listing.views === 1 ? "" : "s"}</span>}
                  </div>
                  <h3>{listing.title || "Untitled draft"}</h3>
                  <strong className="sh-card-price">
                    {listing.price !== null || listing.rentalPrice !== null ? formatListingPrice(listing) : "No price yet"}
                  </strong>
                  <p>Updated {new Date(listing.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                </div>
                <div className="sh-card-actions">
                  <button className="primary" disabled={busy} onClick={() => openEditor(listing.id)}>Edit</button>
                  {listing.status !== "draft"
                    ? <button className="secondary" disabled={busy} onClick={() => go(`/product/${listing.id}`)}>View</button>
                    : <span />}
                </div>
                <div className="sh-card-status-actions">
                  {canMarkSold && <button type="button" disabled={busy} onClick={() => void changeListingStatus(listing.id, "sold")}>Mark sold</button>}
                  {canMarkRented && <button type="button" disabled={busy} onClick={() => void changeListingStatus(listing.id, "rented")}>Mark rented</button>}
                  {canRelist && <button type="button" disabled={busy} onClick={() => void changeListingStatus(listing.id, "active")}>Relist</button>}
                  {canArchive && <button type="button" disabled={busy} onClick={() => void changeListingStatus(listing.id, "archived")}>Archive</button>}
                  <button type="button" className="sh-danger" disabled={busy} onClick={() => void removeListing(listing)}>Delete</button>
                </div>
              </article>
            )
          })
        ) : (
          <div className="seller-empty-block seller-span-full">
            {listings.length ? "No listings in this filter yet." : (
              <div>
                <p>You haven't listed anything yet.</p>
                <button className="primary" type="button" onClick={() => openEditor(null)}>Create your first listing</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  const renderOffers = () => (
    <SellerOffers
      openConversation={(conversationId) => navigate(`/messages?conversation=${encodeURIComponent(conversationId)}`)}
      onPendingCount={setPendingOfferCount}
    />
  )

  const renderOrders = () => (
    <SellerOrders
      listings={listings}
      listingsState={listingsState}
      busyListingId={busyListingId}
      onChangeStatus={changeListingStatus}
      openConversation={(conversationId) => navigate(`/messages?conversation=${encodeURIComponent(conversationId)}`)}
      viewListing={(listingId) => go(`/product/${listingId}`)}
      onBrowseListings={() => setActiveTab("My Listings")}
    />
  )

  const renderSavedMessages = () => <Messages go={go} embedded />

  const renderAssistant = () => (
    <div className="seller-dashboard-section">
      <div className="seller-section-header">
        <div>
          <span className="eyebrow">Automation</span>
          <h1>AI Seller Assistant</h1>
        </div>
      </div>

      <div className="seller-two-column-layout">
        <section className="seller-panel">
          <div className="seller-panel-header">
            <h2>Assistant settings</h2>
          </div>
          <div className="seller-form-grid">
            <label>
              <span>Enable assistant</span>
              <button type="button" className={`toggle-switch ${assistantEnabled ? "enabled" : ""}`} onClick={() => setAssistantEnabled((current) => !current)}>
                <span />
              </button>
            </label>
            <label>
              <span>Preferred responses</span>
              <textarea value={preferredResponses} onChange={(event) => setPreferredResponses(event.target.value)} />
            </label>
            <label>
              <span>Minimum acceptable selling price</span>
              <input value={minAcceptablePrice} onChange={(event) => setMinAcceptablePrice(event.target.value)} />
            </label>
            <label>
              <span>Negotiation limit</span>
              <input value={negotiationLimit} onChange={(event) => setNegotiationLimit(event.target.value)} />
            </label>
            <label>
              <span>Availability</span>
              <input value={availability} onChange={(event) => setAvailability(event.target.value)} />
            </label>
          </div>
        </section>

        <section className="seller-panel">
          <div className="seller-panel-header">
            <h2>AI preview</h2>
          </div>
          <div className="seller-assistant-preview">
            <div className="assistant-preview-box">
              <small>Buyer</small>
              <p>Would you take ₹12,500 for the headphones?</p>
            </div>
            <div className="assistant-preview-box assistant-reply">
              <small>AI generated reply</small>
              <p>Thanks for the offer. I can accept from ₹13,200 and am available for pickup near the library after 5pm.</p>
            </div>
            <p className="seller-rule-note">AI will never negotiate below your configured minimum acceptable selling price or outside your allowed availability.</p>
          </div>
        </section>
      </div>
    </div>
  )

  const renderEarnings = () => (
    <div className="seller-dashboard-section">
      <div className="seller-section-header">
        <div>
          <span className="eyebrow">Reports</span>
          <h1>Earnings &amp; Activity</h1>
        </div>
      </div>
      <div className="seller-empty-block seller-empty-large">
        <h3>No earnings data yet</h3>
        <p>Connect your seller account to view payout totals, fee summaries, and campus transaction activity.</p>
      </div>
    </div>
  )

  const renderSettings = () => (
    <div className="seller-dashboard-section">
      <div className="seller-section-header">
        <div>
          <span className="eyebrow">Account</span>
          <h1>Settings</h1>
        </div>
      </div>
      <div className="seller-panel">
        <div className="seller-panel-header">
          <h2>Seller profile</h2>
        </div>
        <div className="seller-form-grid">
          <label>
            <span>Display name</span>
            <input value={sellerName} readOnly />
          </label>
          <label>
            <span>Verification status</span>
            <input value={user?.email ? `Verified college email (${user.email})` : "Verified student seller"} readOnly />
          </label>
          <label>
            <span>Default campus</span>
            <input value={user?.college ?? ""} readOnly />
          </label>
          <label>
            <span>Meetup preference</span>
            <input value="Set on each listing" readOnly />
          </label>
        </div>
      </div>
    </div>
  )

  const contentMap: Record<SellerHubTab, ReactElement | null> = {
    Overview: renderOverview(),
    "My Listings": renderListings(),
    "Create Listing": <Sell key={editorKey} go={go} listingId={editingListingId ?? undefined} onSaved={handleListingSaved} />,
    "Offers & Negotiations": renderOffers(),
    "Orders & Rentals": renderOrders(),
    Messages: renderSavedMessages(),
    "AI Seller Assistant": renderAssistant(),
    "Earnings & Activity": renderEarnings(),
    Settings: renderSettings(),
  }

  if (isMobile) {
    return (
      <main className="page-shell seller-hub-shell seller-hub-mobile-shell">
        <header className="seller-mobile-header" aria-label="Seller dashboard header">
          <button
            type="button"
            className="seller-mobile-menu-button"
            aria-label={mobileMenuOpen ? "Close seller navigation menu" : "Open seller navigation menu"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((current) => !current)}
          >
            <span />
            <span />
            <span />
          </button>

          <button type="button" className="seller-mobile-brand" onClick={() => selectTab("Overview")}>
            Barterman
          </button>

          <Avatar className="seller-mobile-avatar" src={user?.avatarUrl} name={sellerName} alt="Seller avatar" />
        </header>

        {mobileMenuOpen && (
          <div className="seller-mobile-drawer-backdrop" onClick={() => setMobileMenuOpen(false)}>
            <aside
              className="seller-mobile-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Seller navigation"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="seller-mobile-drawer-header">
                <div className="seller-profile-block">
                  <Avatar src={user?.avatarUrl} name={sellerName} alt="Seller avatar" />
                  <div>
                    <span>Seller Hub</span>
                    <strong>{sellerName}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  className="seller-mobile-close"
                  aria-label="Close seller navigation"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  ×
                </button>
              </div>

              <nav className="seller-navigation seller-mobile-navigation" aria-label="Seller dashboard navigation">
                {sellerHubNavItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className={activeTab === item.label ? "active" : ""}
                    onClick={() => selectTab(item.label)}
                  >
                    <span className="seller-nav-icon" aria-hidden="true">{item.icon}</span>
                    <span className="seller-nav-copy">
                      <span>{item.label}</span>
                      <small>{item.hint}</small>
                    </span>
                  </button>
                ))}
              </nav>
            </aside>
          </div>
        )}

        <section className="seller-main-panel seller-main-panel-mobile">
          {contentMap[activeTab]}
        </section>
      </main>
    )
  }

  return (
    <main className="page-shell seller-hub-shell">
      <div className="seller-hub-layout">
        <aside className="seller-sidebar">
          <div className="seller-sidebar-header">
            <div className="seller-profile-block">
              <Avatar src={user?.avatarUrl} name={sellerName} alt="Seller avatar" />
              <div>
                <span>Seller Hub</span>
                <strong>{sellerName}</strong>
              </div>
            </div>
            <button className="primary seller-create-button" onClick={() => selectTab("Create Listing")}>Create Listing</button>
          </div>

          <nav className="seller-navigation" aria-label="Seller dashboard navigation">
            {sellerHubNavItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className={activeTab === item.label ? "active" : ""}
                onClick={() => selectTab(item.label)}
              >
                <span>{item.label}</span>
                <small>{item.hint}</small>
              </button>
            ))}
          </nav>
        </aside>

        <section className="seller-main-panel">
          {contentMap[activeTab]}
        </section>
      </div>
    </main>
  )
}

// Pages that need a signed-in user with a completed profile.
const PROTECTED_ROUTES: Route[] = ["/seller-hub", "/sell", "/messages", "/profile"]
// Full-screen auth pages, rendered without the site header and footer.
const AUTH_ROUTES: Route[] = ["/sign-in", "/register", "/forgot-password", "/verify-email", "/create-password", "/complete-profile", "/onboarding-next"]
const SIGNED_OUT_ONLY_ROUTES: Route[] = ["/sign-in", "/register", "/forgot-password", "/verify-email", "/create-password"]
const RETURN_TO_KEY = "barterman-return-to"
const DEFAULT_AFTER_AUTH = "/marketplace"

type GuardTarget = Route | "return-to" | null

// Decides where a visitor must be sent for the current auth status, or null to stay.
function resolveGuard(route: Route, status: AuthStatus): GuardTarget {
  const isProtected = PROTECTED_ROUTES.includes(route)
  const isAuthRoute = AUTH_ROUTES.includes(route)
  switch (status) {
    case "loading":
      return null
    case "signed-out":
      return isProtected || route === "/verify-email" || route === "/create-password" || route === "/complete-profile" || route === "/onboarding-next" ? "/sign-in" : null
    case "unverified":
      return isProtected || (isAuthRoute && route !== "/verify-email") ? "/verify-email" : null
    case "needs-password":
      return isProtected || (isAuthRoute && route !== "/create-password") ? "/create-password" : null
    case "needs-profile":
      return isProtected || (isAuthRoute && route !== "/complete-profile") ? "/complete-profile" : null
    case "ready":
      return SIGNED_OUT_ONLY_ROUTES.includes(route) ? "return-to" : null
  }
}

function rememberReturnTo(href: string) {
  try {
    window.sessionStorage.setItem(RETURN_TO_KEY, href)
  } catch {
    // Storage can be unavailable (private mode); fall back to the default destination.
  }
}

function takeReturnTo(): string {
  try {
    const href = window.sessionStorage.getItem(RETURN_TO_KEY)
    window.sessionStorage.removeItem(RETURN_TO_KEY)
    if (href && href.startsWith("/") && !href.startsWith("//")) return href
  } catch {
    // Ignore storage errors.
  }
  return DEFAULT_AFTER_AUTH
}

export default function App() {
  const { route, go, navigate } = useRoute()
  const auth = useAuth()
  const guardTarget = resolveGuard(route, auth.status)

  useEffect(() => {
    if (!guardTarget) return
    if (PROTECTED_ROUTES.includes(route)) rememberReturnTo(window.location.pathname + window.location.search)
    navigate(guardTarget === "return-to" ? takeReturnTo() : guardTarget, { replace: true })
  }, [guardTarget, route, navigate])

  // Leave protected pages first so the guard doesn't redirect to /sign-in mid sign-out.
  const handleSignOut = async () => {
    go("/")
    await auth.signOut()
  }

  const waitingForAuth = auth.status === "loading" && (PROTECTED_ROUTES.includes(route) || AUTH_ROUTES.includes(route))
  if (guardTarget || waitingForAuth) return <AuthLoading />

  const authRoute = AUTH_ROUTES.includes(route)
  const signedIn = auth.status !== "signed-out" && auth.status !== "loading"
  return (
    <>
      {!authRoute && <Header go={go} route={route} signedIn={signedIn} onSignOut={() => void handleSignOut()} />}
      {route === "/" && <PublicLanding go={go} />}
      {route === "/marketplace" && <Marketplace go={go} />}
      {route.startsWith("/product/") && (
        <Product key={route} go={go} navigate={navigate} listingId={decodeURIComponent(route.slice("/product/".length))} />
      )}
      {route === "/seller-hub" && <SellerHub go={go} navigate={navigate} />}
      {route === "/sell" && <Sell go={go} />}
      {route === "/messages" && <Messages go={go} />}
      {route === "/profile" && <Profile go={go} navigate={navigate} />}
      {route === "/request-campus" && <RequestCampus />}
      {route === "/sign-in" && <SignIn go={go} />}
      {route === "/register" && <Register go={go} />}
      {route === "/forgot-password" && <ForgotPassword go={go} />}
      {route === "/verify-email" && <VerifyEmail />}
      {route === "/create-password" && <CreatePassword />}
      {route === "/complete-profile" && <CompleteProfile onSaved={() => go("/onboarding-next")} />}
      {route === "/onboarding-next" && <OnboardingNext onContinue={() => navigate(takeReturnTo())} />}
      {!authRoute && <Footer go={go} route={route} />}
    </>
  )
}
