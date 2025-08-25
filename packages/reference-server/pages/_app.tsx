import "@/styles/globals.css";

import type { AppProps } from "next/app";
import Head from "next/head";

export default function App({ Component, pageProps }: AppProps) {
	return (
		<>
			<Head>
				<title>AURA Lighthouse</title>
				<link rel="aura" href="/api/aura" />
			</Head>
			<Component {...pageProps} />
		</>
	);
}
