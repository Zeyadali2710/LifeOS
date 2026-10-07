export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const m = await import("./server/monitor");
    m.start();
  }
}
