"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { pricing } from "@/lib/data";

export function Pricing() {
  return (
    <section id="pricing" className="bg-graphite px-5 py-24 text-bone sm:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="font-display text-4xl tracking-[0.04em] sm:text-5xl">
          Pricing
        </p>
        <p className="mt-3 max-w-md text-bone/70">
          Start free. Upgrade when you want coaching and form feedback in the loop.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {pricing.map((plan, index) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{
                duration: 0.55,
                delay: index * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={`border p-8 ${
                plan.featured
                  ? "border-lime bg-ink"
                  : "border-bone/20 bg-transparent"
              }`}
            >
              <h3 className="font-display text-3xl tracking-wide">{plan.name}</h3>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-semibold">{plan.price}</span>
                <span className="text-sm text-bone/60">{plan.cadence}</span>
              </p>
              <p className="mt-3 text-sm text-bone/70">{plan.blurb}</p>
              <ul className="mt-6 space-y-2 text-sm text-bone/85">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span className="text-lime">▸</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.featured ? "/api/stripe/checkout" : "/dashboard"}
                className={`mt-8 inline-flex px-5 py-3 text-sm font-semibold transition ${
                  plan.featured
                    ? "bg-lime text-ink hover:bg-white"
                    : "border border-bone/30 text-bone hover:border-lime hover:text-lime"
                }`}
              >
                {plan.cta}
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
