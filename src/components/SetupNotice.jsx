import { missingConfig } from "../lib/firebase.js";

export default function SetupNotice() {
  if (missingConfig.length === 0) return null;
  return (
    <p role="note">
      <strong>Sign in is not set up yet.</strong> Add {missingConfig.join(", ")} to your <code>.env</code> file and
      restart the dev server. You can still browse the shop.
    </p>
  );
}
