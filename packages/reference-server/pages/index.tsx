import Head from "next/head";
import styles from "@/styles/Home.module.css";
import { Geist } from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export default function Home() {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real application, this would handle the login logic.
    // For this demo, we'll just log to console and show an alert.
    const formData = new FormData(e.target as HTMLFormElement);
    const email = formData.get("email");
    console.log("Form submitted with email:", email);
    alert("Login form submitted! Check the console for details. The AI agent will perform this action automatically.");
  };

  return (
    <>
      <Head>
        <title>AURA Lighthouse - Login</title>
        <meta
          name="description"
          content="A reference implementation for the AURA protocol."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={`${styles.main} ${geistSans.variable}`}>
        <div className={styles.container}>
          <h1 className={styles.title}>AURA Lighthouse</h1>
          <p className={styles.description}>
            This is a reference application demonstrating the AURA protocol.
            <br />
            The AI agent can interact with the form below.
          </p>

          <form id="login-form" className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.inputGroup}>
              <label htmlFor="email">Email Address</label>
              <input type="email" id="email" name="email" required />
            </div>
            <div className={styles.inputGroup}>
              <label htmlFor="password">Password</label>
              <input type="password" id="password" name="password" required />
            </div>
            <button type="submit" className={styles.button}>
              Sign In
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
