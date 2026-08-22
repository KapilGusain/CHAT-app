import { auth } from "@/auth";
import { redirect } from "next/navigation";

import { SocketProvider } from "@/components/chat/SocketProvider";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <SocketProvider>
      <div className="min-h-screen bg-slate-950 text-white">
        {children}
      </div>
    </SocketProvider>
  );
}