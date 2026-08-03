import Link from "next/link";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.page}>
      {/* ================= NAV ================= */}

      <header className={styles.navbar}>
        <Link href="/" className={styles.logo}>
          MUSCLE FITNESS
        </Link>

        <nav className={styles.nav}>
          <Link href="#story">MY STORY</Link>
          <Link href="#meal">MEAL PLAN</Link>
          <Link href="#preparation">PREPARATION</Link>
          <Link href="/training">TRAINING</Link>
          <Link href="/login">LOGIN</Link>

          <Link href="/signup" className={styles.navCTA}>
            START FREE
          </Link>
        </nav>
      </header>

      {/* =================================================
          01 HERO
      ================================================= */}

      <section className={`${styles.section} ${styles.hero}`}>
        <div
          className={styles.background}
          style={{
            backgroundImage: "url('/images/hero-bg.jpg')",
          }}
        />

        <div className={styles.heroOverlay} />
        <div className={styles.grid} />

        <div className={styles.heroContent}>
          <div className={styles.chapter}>
            <span>01</span>
            <i />
            <span>DISCIPLINE</span>
          </div>

          <p className={styles.eyebrow}>
            BUILT THROUGH DISCIPLINE
          </p>

          <h1 className={styles.heroTitle}>
            BUILD THE BODY.
            <br />

            <span>
              FORGE THE MIND.
            </span>
          </h1>

          <p className={styles.heroText}>
            Strength is not built in a single workout.
            It is built in every choice you make when nobody is watching.
          </p>

          <div className={styles.heroActions}>
            <Link href="/signup" className={styles.primary}>
              START YOUR JOURNEY
              <span>→</span>
            </Link>

            <Link href="/training" className={styles.secondary}>
              EXPLORE TRAINING
            </Link>
          </div>
        </div>

        <a href="#story" className={styles.scroll}>
          <span>THE JOURNEY BEGINS</span>

          <div>
            <i />
          </div>
        </a>

        <div className={styles.heroGhost}>
          DISCIPLINE
        </div>
      </section>

      {/* =================================================
          02 STORY
      ================================================= */}

      <section
        className={`${styles.section} ${styles.story}`}
        id="story"
      >
        <div
          className={`${styles.background} ${styles.storyBackground}`}
          style={{
            backgroundImage: "url('/images/story-bg.jpg')",
          }}
        />

        <div className={styles.storyOverlay} />
        <div className={styles.grid} />

        <div className={styles.bigNumber}>
          02
        </div>

        <div className={styles.storyInner}>
          {/* LEFT */}

          <div className={styles.storyContent}>
            <div className={styles.chapter}>
              <span>02</span>
              <i />
              <span>MY STORY</span>
            </div>

            <p className={styles.eyebrow}>
              BEFORE THE CONFIDENCE
            </p>

            <h2 className={styles.sectionTitle}>
              I WASN&apos;T
              <br />
              ALWAYS
              <br />

              <span>THIS PERSON.</span>
            </h2>

            <p className={styles.storyLead}>
              Before discipline, there was doubt.
              <br />
              Before confidence, there was insecurity.
            </p>

            <p className={styles.bodyText}>
              I know what it feels like to look in the mirror and wish
              you were someone else. To avoid cameras. To struggle to
              believe that change was even possible.
            </p>

            <Link
              href="/story"
              className={styles.textLink}
            >
              READ THE FULL STORY
              <span>→</span>
            </Link>
          </div>

          {/* RIGHT */}

          <div className={styles.transformationCard}>
            <div className={styles.cardHeader}>
              <span>TRANSFORMATION</span>
              <span>8 MONTHS</span>
            </div>

            <div className={styles.weightRow}>
              <div className={styles.weight}>
                <small>START</small>

                <div>
                  <strong>88</strong>
                  <span>KG</span>
                </div>
              </div>

              <div className={styles.progress}>
                <div>
                  <span />
                </div>

                <small>−20 KG</small>
              </div>

              <div className={`${styles.weight} ${styles.weightEnd}`}>
                <small>MILESTONE</small>

                <div>
                  <strong>68</strong>
                  <span>KG</span>
                </div>
              </div>
            </div>

            <blockquote>
              “The body changed first. But the person I became
              was the real transformation.”
            </blockquote>

            <div className={styles.principles}>
              <span>DISCIPLINE</span>
              <span>CONSISTENCY</span>
              <span>PATIENCE</span>
            </div>
          </div>
        </div>

        <a href="#meal" className={styles.next}>
          NEXT — FUEL
          <span>↓</span>
        </a>
      </section>

      {/* =================================================
          03 MEAL PLAN
      ================================================= */}

      <section
        className={`${styles.section} ${styles.meal}`}
        id="meal"
      >
        <div
          className={`${styles.background} ${styles.mealBackground}`}
          style={{
            backgroundImage: "url('/images/meal-bg.jpg')",
          }}
        />

        <div className={styles.mealOverlay} />
        <div className={styles.grid} />

        <div className={`${styles.bigNumber} ${styles.bigNumberRight}`}>
          03
        </div>

        <div className={styles.mealInner}>
          <div className={styles.chapter}>
            <span>03</span>
            <i />
            <span>NUTRITION</span>
          </div>

          <p className={styles.eyebrow}>
            FUEL WITH PURPOSE
          </p>

          <h2 className={styles.sectionTitle}>
            TRAINING CREATES
            <br />
            THE DEMAND.
            <br />

            <span>
              FOOD BUILDS THE RESULT.
            </span>
          </h2>

          <div className={styles.mealIntro}>
            <p>
              No random diets. No starving. No eating without direction.
              Nutrition should support performance, recovery and progress.
            </p>

            <span>
              PURPOSE OVER RESTRICTION.
            </span>
          </div>

          <div className={styles.mealCards}>
            <article className={styles.mealCard}>
              <div className={styles.mealCardTop}>
                <span>01</span>
                <span>ENERGY</span>
              </div>

              <h3>
                PERSONAL
                <br />
                CALORIES
              </h3>

              <p>
                Built around your body, activity level,
                training frequency and goal.
              </p>

              <b>↗</b>
            </article>

            <article className={styles.mealCard}>
              <div className={styles.mealCardTop}>
                <span>02</span>
                <span>STRUCTURE</span>
              </div>

              <h3>
                SMART
                <br />
                MACROS
              </h3>

              <p>
                Protein, carbohydrates and fats organised
                around performance and recovery.
              </p>

              <b>↗</b>
            </article>

            <article className={styles.mealCard}>
              <div className={styles.mealCardTop}>
                <span>03</span>
                <span>CONSISTENCY</span>
              </div>

              <h3>
                REAL
                <br />
                FOOD
              </h3>

              <p>
                Meals that fit real schedules and are
                practical enough to repeat.
              </p>

              <b>↗</b>
            </article>
          </div>

          <div className={styles.mealBottom}>
            <p>
              EAT WITH PURPOSE.
              <br />
              TRAIN WITH INTENT.
              <br />
              RECOVER WITH PATIENCE.
            </p>

            <Link href="/meal-plan" className={styles.primary}>
              BUILD MY MEAL PLAN
              <span>→</span>
            </Link>
          </div>
        </div>

        <a href="#preparation" className={styles.next}>
          NEXT — PREPARATION
          <span>↓</span>
        </a>
      </section>

      {/* =================================================
          04 PREPARATION
      ================================================= */}

      <section
        className={`${styles.section} ${styles.preparation}`}
        id="preparation"
      >
        <div
          className={`${styles.background} ${styles.preparationBackground}`}
          style={{
            backgroundImage: "url('/images/preparation-bg.jpg')",
          }}
        />

        <div className={styles.preparationOverlay} />
        <div className={styles.grid} />

        <div className={styles.bigNumber}>
          04
        </div>

        <div className={styles.preparationInner}>
          <div className={styles.chapter}>
            <span>04</span>
            <i />
            <span>PREPARATION</span>
          </div>

          <p className={styles.eyebrow}>
            REMOVE THE EXCUSES
          </p>

          <h2 className={styles.sectionTitle}>
            MOTIVATION
            <br />
            DISAPPEARS.
            <br />

            <span>
              SYSTEMS REMAIN.
            </span>
          </h2>

          <p className={styles.preparationIntro}>
            Progress becomes easier when the decisions have
            already been made.
          </p>

          <div className={styles.steps}>
            <div className={styles.step}>
              <span>01</span>

              <div>
                <h3>PLAN</h3>
                <p>Know what happens before the week begins.</p>
              </div>

              <b>→</b>
            </div>

            <div className={styles.step}>
              <span>02</span>

              <div>
                <h3>PREPARE</h3>
                <p>Food, equipment, schedule and environment.</p>
              </div>

              <b>→</b>
            </div>

            <div className={styles.step}>
              <span>03</span>

              <div>
                <h3>EXECUTE</h3>
                <p>Stop renegotiating the plan every morning.</p>
              </div>

              <b>→</b>
            </div>

            <div className={styles.step}>
              <span>04</span>

              <div>
                <h3>ADJUST</h3>
                <p>Track. Learn. Improve. Repeat.</p>
              </div>

              <b>→</b>
            </div>
          </div>

          <div className={styles.finalCTA}>
            <small>YOUR NEXT CHAPTER</small>

            <h3>
              BUILD A BODY
              <br />
              THAT REFLECTS
              <br />
              YOUR STANDARD.
            </h3>

            <Link href="/signup" className={styles.primary}>
              START BUILDING
              <span>→</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}