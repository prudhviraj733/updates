import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute({ children, adminOnly = false }) {
  const { user } = useAuth();

  if (user === null) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-forest border-t-transparent" />
      </div>
    );
  }
  if (user === false) {
    return <Navigate to={adminOnly ? "/admin/login" : "/login"} replace />;
  }
  if (adminOnly && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return children;
}
