import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Dumbbell,
  Flame,
  Gauge,
  ShieldCheck,
  Target,
  TrendingUp,
} from "lucide-react";

import styles from "./training.module.css";

export const metadata: Metadata = {
  title: "Training | Muscle Fitness",
  description:
    "Structured training programs designed around progression, discipline and measurable performance.",
};

const benefits = [
  {
    icon: Target,
    title: "CLEAR DIRECTION",
    description:
      "Every workout has a purpose, exercise order, repetition range and progression target.",
  },
  {
    icon: TrendingUp,
    title: "PROGRESSIVE OVERLOAD",
    description:
      "Track your working weight and repetitions so performance continues moving forward.",
  },
  {
    icon: CalendarDays,
    title: "WEEKLY STRUCTURE",
    description:
      "Follow a schedule that matches your available training days and recovery ability.",
  },
  {
    icon: ShieldCheck,
    title: "RECOVERY CONTROL",
    description:
      "Balance hard training with planned rest, controlled volume and fatigue management.",
  },
];

const programs = [
  {
    number: "01",
    title: "FOUNDATION",
    level: "BEGINNER",
    duration: "8 WEEKS",
    frequency: "3 DAYS / WEEK",
    description:
      "Build proper technique, training consistency and a reliable strength foundation.",
    features: [
      "Full-body training structure",
      "Exercise technique guidance",
      "Simple progression method",
      "Basic recovery targets",
    ],
    featured: false,
  },
  {
    number: "02",
    title: "MUSCLE BUILDER",
    level: "INTERMEDIATE",
    duration: "12 WEEKS",
    frequency: "4–5 DAYS / WEEK",
    description:
      "Develop balanced muscle with structured hypertrophy volume and progressive overload.",
    features: [
      "Push, pull and lower-body structure",
      "Weekly muscle-volume targets",
      "Progressive overload tracking",
      "Fatigue and deload management",
    ],
    featured: true,
  },
  {
    number: "03",
    title: "4D PERFORMANCE",
    level: "ADVANCED",
    duration: "16 WEEKS",
    frequency: "5–6 DAYS / WEEK",
    description:
      "A higher-volume system focused on weak points, performance and advanced progression.",
    features: [
      "Priority muscle specialization",
      "Advanced progression blocks",
      "Strength and hypertrophy phases",
      "Detailed performance tracking",
    ],
    featured: false,
  },
];

const exercises = [
  {
    name: "BARBELL BENCH PRESS",
    muscle: "CHEST",
    sets: "4",
    reps: "6–8",
    rest: "120 SEC",
  },
  {
    name: "INCLINE DUMBBELL PRESS",
    muscle: "UPPER CHEST",
    sets: "3",
    reps: "8–10",
    rest: "90 SEC",
  },
  {
    name: "CABLE CHEST FLY",
    muscle: "CHEST",
    sets: "3",
    reps: "12–15",
    rest: "60 SEC",
  },
  {
    name: "CABLE LATERAL RAISE",
    muscle: "SIDE DELTS",
    sets: "4",
    reps: "12–15",
    rest: "60 SEC",
  },
];

const processSteps = [
  {
    number: "01",
    title: "BUILD YOUR PROFILE",
    description:
      "Enter your experience, available days, equipment and priority muscle groups.",
  },
  {
    number: "02",
    title: "SELECT YOUR LEVEL",
    description:
      "Choose the program that matches your present ability and weekly schedule.",
  },
  {
    number: "03",
    title: "COMPLETE THE WORK",
    description:
      "Follow every planned session and record your working sets accurately.",
  },
  {
    number: "04",
    title: "TRACK AND ADJUST",
    description:
      "Use performance data to improve weight, repetitions and execution quality.",
  },
];

export default function TrainingPage() {
  return (
    <main className={styles.page}>
      {/* HERO */}
      <section className={styles.hero}>
        <div className={styles.gridBackground} />
        <div className={styles.heroGlow} />

        <div className={styles.container}>
          <div className={styles.heroGrid}>
            <div className={styles.heroContent}>
              <div className={styles.chapter}>
                <span>01</span>
                <span className={styles.chapterLine} />
                <span>TRAINING</span>
              </div>

              <p className={styles.eyebrow}>BUILT THROUGH DISCIPLINE</p>

              <h1 className={styles.heroTitle}>
                TRAIN WITH
                <span>PURPOSE.</span>
              </h1>

              <p className={styles.heroDescription}>
                Structured training built to remove confusion, improve
                performance and turn repeated effort into measurable progress.
              </p>

              <div className={styles.heroActions}>
                <Link href="/signup" className={styles.primaryButton}>
                  START TRAINING
                  <ArrowRight size={16} />
                </Link>

                <a href="#programs" className={styles.secondaryButton}>
                  VIEW PROGRAMS
                  <ChevronDown size={16} />
                </a>
              </div>

              <div className={styles.heroStats}>
                <Stat value="3" label="TRAINING LEVELS" />
                <Stat value="8–16" label="WEEK PROGRAMS" />
                <Stat value="100%" label="TRACKABLE" />
                <Stat value="4D" label="MENTALITY" />
              </div>
            </div>

            <div className={styles.workoutCard}>
              <div className={styles.workoutCardHeader}>
                <div>
                  <p className={styles.smallLabel}>TODAY&apos;S TRAINING</p>
                  <h2>PUSH — CHEST FOCUS</h2>
                </div>

                <div className={styles.iconBox}>
                  <Dumbbell size={23} />
                </div>
              </div>

              <div className={styles.exercisePreviewList}>
                {exercises.slice(0, 3).map((exercise, index) => (
                  <div className={styles.exercisePreview} key={exercise.name}>
                    <span className={styles.exerciseNumber}>
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <div className={styles.exercisePreviewContent}>
                      <p>{exercise.name}</p>
                      <span>{exercise.muscle}</span>
                    </div>

                    <strong>
                      {exercise.sets} × {exercise.reps}
                    </strong>
                  </div>
                ))}
              </div>

              <div className={styles.workoutSummary}>
                <Stat value="58 MIN" label="DURATION" />
                <Stat value="16" label="WORKING SETS" />
                <Stat value="HIGH" label="INTENSITY" />
              </div>
            </div>
          </div>
        </div>

        <a href="#benefits" className={styles.scrollIndicator}>
          <span>DISCOVER THE SYSTEM</span>
          <span className={styles.scrollLine} />
        </a>
      </section>

      {/* BENEFITS */}
      <section id="benefits" className={styles.section}>
        <div className={styles.container}>
          <SectionHeading
            chapter="02"
            eyebrow="BUILT FOR PROGRESS"
            title={
              <>
                MORE THAN A LIST
                <span>OF EXERCISES.</span>
              </>
            }
            description="Every part of the training system is designed to give your effort a clear direction."
          />

          <div className={styles.benefitGrid}>
            {benefits.map((benefit) => {
              const Icon = benefit.icon;

              return (
                <article className={styles.benefitCard} key={benefit.title}>
                  <div className={styles.benefitIcon}>
                    <Icon size={21} />
                  </div>

                  <h3>{benefit.title}</h3>
                  <p>{benefit.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* PROGRAMS */}
      <section id="programs" className={styles.programSection}>
        <div className={styles.container}>
          <SectionHeading
            chapter="03"
            eyebrow="TRAINING PROGRAMS"
            title={
              <>
                SELECT YOUR
                <span>STARTING LEVEL.</span>
              </>
            }
            description="Choose the structure that matches your current experience, recovery and available training time."
          />

          <div className={styles.programGrid}>
            {programs.map((program) => (
              <article
                key={program.title}
                className={`${styles.programCard} ${
                  program.featured ? styles.featuredProgram : ""
                }`}
              >
                {program.featured && (
                  <span className={styles.popularBadge}>MOST POPULAR</span>
                )}

                <p className={styles.programNumber}>
                  PROGRAM {program.number}
                </p>

                <h3>{program.title}</h3>
                <p className={styles.programDescription}>
                  {program.description}
                </p>

                <div className={styles.programMeta}>
                  <MetaItem label="LEVEL" value={program.level} />
                  <MetaItem label="DURATION" value={program.duration} />
                </div>

                <div className={styles.frequency}>
                  <Clock3 size={17} />

                  <div>
                    <span>FREQUENCY</span>
                    <strong>{program.frequency}</strong>
                  </div>
                </div>

                <ul className={styles.featureList}>
                  {program.features.map((feature) => (
                    <li key={feature}>
                      <Check size={15} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/signup"
                  className={
                    program.featured
                      ? styles.programPrimary
                      : styles.programSecondary
                  }
                >
                  SELECT PROGRAM
                  <ArrowRight size={15} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* WORKOUT PREVIEW */}
      <section className={styles.workoutSection}>
        <div className={styles.container}>
          <div className={styles.twoColumn}>
            <div>
              <SectionHeading
                chapter="04"
                eyebrow="SESSION STRUCTURE"
                title={
                  <>
                    KNOW EXACTLY
                    <span>WHAT TO DO.</span>
                  </>
                }
                description="Every session shows the exercise order, working sets, repetition targets, rest periods and muscle focus."
              />

              <div className={styles.checkList}>
                <CheckItem text="Exercise order and target muscle" />
                <CheckItem text="Working sets and repetition range" />
                <CheckItem text="Rest time between working sets" />
                <CheckItem text="Previous performance history" />
              </div>
            </div>

            <div className={styles.sessionPanel}>
              <div className={styles.sessionHeader}>
                <div>
                  <p className={styles.smallLabel}>WORKOUT PREVIEW</p>
                  <h3>PUSH A — CHEST PRIORITY</h3>
                </div>

                <span className={styles.durationBadge}>58 MINUTES</span>
              </div>

              <div className={styles.exerciseTable}>
                {exercises.map((exercise, index) => (
                  <div className={styles.exerciseRow} key={exercise.name}>
                    <span className={styles.exerciseNumber}>
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <div className={styles.exerciseName}>
                      <strong>{exercise.name}</strong>
                      <span>{exercise.muscle}</span>
                    </div>

                    <ExerciseValue label="SETS" value={exercise.sets} />
                    <ExerciseValue label="REPS" value={exercise.reps} />
                    <ExerciseValue label="REST" value={exercise.rest} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROCESS */}
      <section className={styles.section}>
        <div className={styles.container}>
          <SectionHeading
            chapter="05"
            eyebrow="THE PROCESS"
            title={
              <>
                FROM PROFILE
                <span>TO PROGRESSION.</span>
              </>
            }
            description="A clear path from your first setup to ongoing performance improvements."
          />

          <div className={styles.processGrid}>
            {processSteps.map((step) => (
              <article className={styles.processCard} key={step.number}>
                <p className={styles.processNumber}>{step.number}</p>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* PROGRESS */}
      <section className={styles.progressSection}>
        <div className={styles.container}>
          <div className={styles.twoColumn}>
            <div className={styles.progressPanel}>
              <div className={styles.progressHeader}>
                <div>
                  <p className={styles.smallLabel}>TRAINING PERFORMANCE</p>
                  <h3>WEEKLY PROGRESS</h3>
                </div>

                <BarChart3 size={25} />
              </div>

              <div className={styles.chart}>
                {["42%", "50%", "47%", "63%", "70%", "78%", "90%"].map(
                  (height, index) => (
                    <div className={styles.chartColumn} key={index}>
                      <span style={{ height }} />
                    </div>
                  ),
                )}
              </div>

              <div className={styles.progressStats}>
                <Stat value="12" label="WORKOUTS" />
                <Stat value="92%" label="COMPLETION" />
                <Stat value="+7.5 KG" label="BENCH PRESS" />
              </div>
            </div>

            <div>
              <SectionHeading
                chapter="06"
                eyebrow="MEASURABLE PROGRESS"
                title={
                  <>
                    TRACK THE WORK.
                    <span>EARN THE RESULT.</span>
                  </>
                }
                description="Review completed sessions, training volume, strength changes and weekly consistency."
              />

              <div className={styles.trackingList}>
                <TrackingItem
                  icon={<Gauge size={19} />}
                  text="Track completed workouts and weekly consistency."
                />

                <TrackingItem
                  icon={<TrendingUp size={19} />}
                  text="Compare working weight and repetitions over time."
                />

                <TrackingItem
                  icon={<Flame size={19} />}
                  text="Build training streaks and stronger habits."
                />
              </div>

              <Link href="/dashboard" className={styles.secondaryButton}>
                OPEN DASHBOARD
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className={styles.finalCta}>
        <div className={styles.ctaGlow} />

        <div className={styles.container}>
          <p className={styles.eyebrow}>YOUR NEXT SESSION STARTS HERE</p>

          <h2>
            STOP TRAINING
            <span>WITHOUT DIRECTION.</span>
          </h2>

          <p>
            Select your level, follow the structure and turn every completed
            workout into measurable progress.
          </p>

          <div className={styles.ctaActions}>
            <Link href="/signup" className={styles.primaryButton}>
              START TRAINING FREE
              <ArrowRight size={16} />
            </Link>

            <Link href="/" className={styles.secondaryButton}>
              RETURN HOME
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function SectionHeading({
  chapter,
  eyebrow,
  title,
  description,
}: {
  chapter: string;
  eyebrow: string;
  title: React.ReactNode;
  description: string;
}) {
  return (
    <div className={styles.sectionHeading}>
      <div className={styles.chapter}>
        <span>{chapter}</span>
        <span className={styles.chapterLine} />
        <span>{eyebrow}</span>
      </div>

      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className={styles.stat}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metaItem}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CheckItem({ text }: { text: string }) {
  return (
    <div className={styles.checkItem}>
      <span>
        <Check size={14} />
      </span>
      <p>{text}</p>
    </div>
  );
}

function ExerciseValue({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.exerciseValue}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TrackingItem({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className={styles.trackingItem}>
      <span>{icon}</span>
      <p>{text}</p>
    </div>
  );
}