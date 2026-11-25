import { useMemo } from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS, useOrg } from "@/lib/org";
import { teamOf } from "@/lib/sales-ops";
import type { Member } from "@/lib/sales-data";

export const EVERYONE = "__everyone";
export const MY_TEAM = "__mine";
export const UNASSIGNED = "__unassigned";

/**
 * "Whose numbers?" picker for the sales pages: everyone, my team, a manager's or team lead's whole team,
 * or one person. Returns owner ids through `useTeamScope`.
 */
export function TeamFilter({ members, value, onChange }: { members: Member[]; value: string; onChange: (value: string) => void }) {
  const leaders = members.filter((m) => members.some((x) => x.reports_to === m.user_id));
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-52 rounded-xl" aria-label="Team"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={EVERYONE}>Everyone</SelectItem>
        <SelectItem value={MY_TEAM}>My team</SelectItem>
        <SelectItem value={UNASSIGNED}>Unassigned (AI calls)</SelectItem>
        {leaders.length > 0 && (
          <SelectGroup>
            <SelectLabel>Teams</SelectLabel>
            {leaders.map((m) => <SelectItem key={`t-${m.user_id}`} value={`team:${m.user_id}`}>{m.name}'s team · {ROLE_LABELS[m.role]}</SelectItem>)}
          </SelectGroup>
        )}
        <SelectGroup>
          <SelectLabel>People</SelectLabel>
          {members.map((m) => <SelectItem key={`p-${m.user_id}`} value={`user:${m.user_id}`}>{m.name}</SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/** Turns the picker value into a predicate on a row's owner id. */
export function useTeamScope(members: Member[], value: string): (ownerId: string | null | undefined) => boolean {
  const { userId } = useOrg();
  return useMemo(() => {
    if (value === EVERYONE) return () => true;
    if (value === UNASSIGNED) return (owner) => !owner;
    if (value.startsWith("user:")) { const id = value.slice(5); return (owner) => owner === id; }
    const root = value === MY_TEAM ? userId : value.slice(5);
    const team = teamOf(members, root);
    return (owner) => !!owner && team.has(owner);
  }, [members, value, userId]);
}
