"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { provisionAllActiveEmployees } from "@/lib/actions/leave-actions";

export function ProvisionButton({ year }: { year: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleProvision = async () => {
    setLoading(true);
    const result = await provisionAllActiveEmployees(year);
    if ("error" in result && result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Provisioned ${result.provisioned} leave credit records for ${year}.`);
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleProvision} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      Provision Credits ({year})
    </Button>
  );
}
