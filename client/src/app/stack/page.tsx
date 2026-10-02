import type { Metadata } from "next";
import Stack from "@/components/stack/Stack";

export const metadata: Metadata = {
  title: "Stack",
};

export default function StackPage() {
  return (
    <main className="flex min-h-screen flex-1 justify-center overflow-hidden bg-[#f5f5f4] px-4 pt-[18vh] font-sans dark:bg-[#0a0a0a]">
      <Stack />
    </main>
  );
}
