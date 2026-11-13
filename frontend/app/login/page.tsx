import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";
export default function LoginPage() { return <AuthLayout title="Welcome back" subtitle="Sign in to track reports and community progress."><AuthForm mode="login" /></AuthLayout>; }
