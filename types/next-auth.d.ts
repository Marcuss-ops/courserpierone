import "next-auth";
import "next-auth/jwt";
import "@auth/core/adapters";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      image: string | null;
      role: string;
    };
  }

  interface User {
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    role?: string;
  }
}
