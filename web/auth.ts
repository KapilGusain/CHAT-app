import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";

export const { handlers, signIn, signOut, auth, } = NextAuth({
  session: {
    strategy: "jwt",
  },

  providers: [
    Credentials({
      credentials: {
        email: {
          label: "Email",
          type: "email",
        },

        password: {
          label: "Password",
          type: "password",
        },
      },

      async authorize(credentials) {
        if (
          typeof credentials?.email !==
            "string" ||
          typeof credentials?.password !==
            "string"
        ) {
          return null;
        }

        const user =
          await prisma.user.findUnique({
            where: {
              email: credentials.email,
            },
          });

        if (
          !user ||
          !user.passwordHash
        ) {
          return null;
        }

        const passwordValid =
          await bcrypt.compare(
            credentials.password,
            user.passwordHash
          );

        if (!passwordValid) {
          return null;
        }

        return {
          id: user.id,
          name: user.username,
          email: user.email,
          image: user.avatarUrl,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({
      token,
      user,
    }) {
      if (user) {
        token.userId = user.id;
      }

      return token;
    },

    async session({
      session,
      token,
    }) {
      if (
        session.user &&
        token.userId
      ) {
        session.user.id =
          token.userId as string;
      }

      return session;
    },
  },
});