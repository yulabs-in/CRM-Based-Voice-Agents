import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getCallRecordingPlaybackUrl } from "@/lib/recordings.functions";

export function CallRecordingPlayer({ callId }: { callId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const getUrl = useServerFn(getCallRecordingPlaybackUrl);

  async function play() {
    if (url) return;
    setLoading(true);
    try {
      const result = await getUrl({ data: { callId } });
      setUrl(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open this recording");
    } finally {
      setLoading(false);
    }
  }

  if (url) return <audio controls preload="none" src={url} className="h-8 w-64" />;
  return (
    <Button type="button" size="sm" variant="outline" disabled={loading} onClick={play}>
      {loading ? <Loader2 className="animate-spin" /> : <Play />}
      Listen
    </Button>
  );
}