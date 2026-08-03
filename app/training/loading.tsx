import styles from "./training.module.css";

export default function TrainingLoading() {
  return (
    <main className={styles.page}>
      <div
        style={{
          width: "min(100% - 48px, 1480px)",
          minHeight: "100vh",
          margin: "0 auto",
          padding: "120px 0",
        }}
      >
        <div
          style={{
            width: "220px",
            height: "10px",
            background: "#151515",
          }}
        />

        <div
          style={{
            width: "min(100%, 800px)",
            height: "110px",
            marginTop: "38px",
            background: "#0d0d0d",
          }}
        />

        <div
          style={{
            width: "min(100%, 650px)",
            height: "24px",
            marginTop: "34px",
            background: "#101010",
          }}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
            marginTop: "90px",
          }}
        >
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              style={{
                height: "290px",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "#090909",
              }}
            />
          ))}
        </div>
      </div>
    </main>
  );
}