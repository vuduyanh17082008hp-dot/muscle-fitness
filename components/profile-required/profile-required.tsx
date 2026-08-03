import Link from "next/link";
import styles from "./profile-required.module.css";

type ProfileRequiredProps = {
  title?: string;
  description?: string;
};

export default function ProfileRequired({
  title = "BUILD YOUR PROFILE.",
  description = "Before we create your training and nutrition system, we need to understand your body, lifestyle and objective.",
}: ProfileRequiredProps) {
  return (
    <main className={styles.page}>
      <div className={styles.background} />
      <div className={styles.overlay} />
      <div className={styles.grid} />
      <div className={styles.backgroundWord}>BEGIN</div>

      <header className={styles.navbar}>
        <Link href="/" className={styles.logo}>
          MUSCLE FITNESS
        </Link>

        <div className={styles.status}>
          <span />
          PROFILE REQUIRED
        </div>
      </header>

      <section className={styles.layout}>
        <div className={styles.content}>
          <div className={styles.chapter}>
            <span>00</span>
            <i />
            <span>YOUR STARTING POINT</span>
          </div>

          <p className={styles.eyebrow}>
            PERSONALISATION BEGINS WITH CLARITY
          </p>

          <h1>
            {title}
            <br />
            <span>BUILD YOUR SYSTEM.</span>
          </h1>

          <p className={styles.description}>
            {description}
          </p>

          <div className={styles.steps}>
            <article>
              <span>01</span>

              <div>
                <h2>BODY INFORMATION</h2>
                <p>
                  Sex, age group, exact age, height and current weight.
                </p>
              </div>
            </article>

            <article>
              <span>02</span>

              <div>
                <h2>YOUR OBJECTIVE</h2>
                <p>
                  Fat loss, maintenance, healthy development or muscle gain.
                </p>
              </div>
            </article>

            <article>
              <span>03</span>

              <div>
                <h2>PERSONALISED SYSTEM</h2>
                <p>
                  Your information will be used to build meal and training
                  recommendations.
                </p>
              </div>
            </article>
          </div>

          <blockquote className={styles.quote}>
            <span>“</span>

            <p>
              A powerful transformation starts by being honest about where you
              are today.
            </p>
          </blockquote>
        </div>

        <aside className={styles.card}>
          <div className={styles.cardTop}>
            <span>PROFILE SETUP</span>
            <span>0%</span>
          </div>

          <div className={styles.progress}>
            <span />
          </div>

          <div className={styles.cardNumber}>01</div>

          <p className={styles.cardEyebrow}>REQUIRED BEFORE CONTINUING</p>

          <h2>
            TELL US
            <br />
            WHERE YOU
            <br />
            <span>ARE STARTING.</span>
          </h2>

          <p className={styles.cardDescription}>
            This takes approximately two minutes. Your information can be
            updated later from the dashboard.
          </p>

          <Link href="/onboarding" className={styles.button}>
            <span>START ONBOARDING</span>
            <b>→</b>
          </Link>

          <Link href="/" className={styles.backLink}>
            ← RETURN HOME
          </Link>

          <div className={styles.security}>
            <span />
            YOUR PROFILE DATA IS PROTECTED
          </div>
        </aside>
      </section>
    </main>
  );
}