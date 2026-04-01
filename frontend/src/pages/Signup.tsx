import { useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();

  const handleSignup = async () => {
    setLoading(true);
    setErrorMsg("");
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    setLoading(false);
    if (error) setErrorMsg(error.message);
    else {
      alert("Signup successful! Check your email to confirm.");
      navigate("/login");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4">Signup</h1>
        {errorMsg && <p className="text-red-500">{errorMsg}</p>}
        <input
          className="border p-2 w-full mb-4"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="border p-2 w-full mb-4"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          className="bg-blue-500 text-white py-2 px-4 rounded w-full"
          onClick={handleSignup}
          disabled={loading}
        >
          {loading ? "Signing up..." : "Signup"}
        </button>
      </div>
    </div>
  );
}