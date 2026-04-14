import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface LeaveCreditWithType {
  id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  total_credits: number;
  used_credits: number;
  balance: number;
  leave_types: { code: string; name: string } | null;
}

export function LeaveCreditsTab({
  leaveCredits,
}: {
  leaveCredits: LeaveCreditWithType[];
}) {
  if (leaveCredits.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No leave credits allocated for this year.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {leaveCredits.map((credit) => (
        <Card key={credit.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {credit.leave_types?.name ?? "Unknown"}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {credit.leave_types?.code ?? ""}
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{credit.balance}</span>
              <span className="text-sm text-muted-foreground">
                / {credit.total_credits}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {credit.used_credits} used
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
