import * as React from "react"
import { motion, useMotionTemplate, useMotionValue, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false)
    const reduceMotion = useReducedMotion()
    const mouseX = useMotionValue(0)
    const mouseY = useMotionValue(0)
    const glow = useMotionTemplate`
      radial-gradient(
        ${visible && !reduceMotion ? "100px" : "0px"} circle at ${mouseX}px ${mouseY}px,
        rgb(47 117 109 / 22%),
        transparent 80%
      )
    `

    function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
      const bounds = event.currentTarget.getBoundingClientRect()
      mouseX.set(event.clientX - bounds.left)
      mouseY.set(event.clientY - bounds.top)
    }

    return (
      <motion.div
        style={{ background: glow }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="group/input rounded-[10px] p-[2px] transition duration-300"
      >
        <input
          ref={ref}
          type={type}
          className={cn(
            "flex h-11 w-full rounded-lg border border-[var(--stone-grey)] bg-[var(--soft-ivory)] px-3 py-2 text-sm text-[var(--charcoal)] placeholder:text-[var(--text-secondary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)] disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
      </motion.div>
    )
  },
)

Input.displayName = "Input"

export { Input }
