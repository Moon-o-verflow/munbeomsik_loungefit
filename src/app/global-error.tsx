"use client";

export default function GlobalError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <html lang="ko">
      <body>
        <main>
          <section>
            <h1>잠시 문제가 발생했습니다.</h1>
            <button type="button" onClick={unstable_retry}>다시 시도</button>
          </section>
        </main>
      </body>
    </html>
  );
}
