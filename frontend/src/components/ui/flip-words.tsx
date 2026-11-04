import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { cn } from "@/lib/utils"

export const FlipWords = ({
  words,
  duration = 2200,
  className,
}: {
  words: string[]
  duration?: number
  className?: string
}) => {
  const [currentWord, setCurrentWord] = useState(words[0])
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    if (isAnimating) return

    const timeout = window.setTimeout(() => {
      setCurrentWord((previousWord) => {
        const currentIndex = words.indexOf(previousWord)
        return words[(currentIndex + 1) % words.length] ?? words[0]
      })
      setIsAnimating(true)
    }, duration)

    return () => window.clearTimeout(timeout)
  }, [duration, isAnimating, words])

  return (
    <AnimatePresence onExitComplete={() => setIsAnimating(false)}>
      <motion.span
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 140, damping: 16 }}
        exit={{
          opacity: 0,
          y: -24,
          x: 18,
          filter: "blur(5px)",
          scale: 1.4,
          position: "absolute",
        }}
        className={cn(
          "z-10 inline-block relative text-left text-emerald-700 dark:text-emerald-300 px-2",
          className,
        )}
        key={currentWord}
      >
        {currentWord.split(" ").map((word, wordIndex) => (
          <motion.span
            key={word + wordIndex}
            initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ delay: wordIndex * 0.18, duration: 0.2 }}
            className="inline-block whitespace-nowrap"
          >
            {word.split("").map((letter, letterIndex) => (
              <motion.span
                key={word + letterIndex}
                initial={{ opacity: 0, y: 8, filter: "blur(5px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{
                  delay: wordIndex * 0.18 + letterIndex * 0.03,
                  duration: 0.16,
                }}
                className="inline-block"
              >
                {letter}
              </motion.span>
            ))}
            <span className="inline-block">&nbsp;</span>
          </motion.span>
        ))}
      </motion.span>
    </AnimatePresence>
  )
}
