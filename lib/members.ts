/** Synthetic insurer members. "Andes Assist" is a fictional travel insurer. */
const MEMBERS = [
  { policy: "TRV-4471-0923", name: "Mark Ellison", insurer: "Andes Assist", plan: "Traveler Plus", homeVisits: true, age: 34 },
  { policy: "TRV-2210-5518", name: "Priya Raman", insurer: "Andes Assist", plan: "Traveler Basic", homeVisits: true, age: 29 },
  { policy: "TRV-8803-1146", name: "Sophie Laurent", insurer: "Andes Assist", plan: "Traveler Plus", homeVisits: true, age: 41 },
  { policy: "TRV-3390-7782", name: "Daniel Okafor", insurer: "Andes Assist", plan: "Expat Annual", homeVisits: true, age: 58 },
  { policy: "TRV-6615-2047", name: "Hannah Weiss", insurer: "Andes Assist", plan: "Expat Annual", homeVisits: true, age: 46 },
];

const digits = (s: string) => s.replace(/\D/g, "");
const words = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

export function verifyMember(policyNumber: string, name?: string) {
  const d = digits(policyNumber);
  const m = MEMBERS.find((x) => digits(x.policy) === d);
  if (!m) return { verified: false as const, reason: "No policy found with that number." };
  if (name) {
    const said = words(name);
    const onFile = words(m.name);
    if (!said.some((w) => onFile.includes(w)))
      return { verified: false as const, reason: "The policy exists but the name does not match." };
  }
  return { verified: true as const, member: m };
}

export const DEMO_POLICY = MEMBERS[0];
