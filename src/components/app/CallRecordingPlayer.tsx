import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getCallRecordingPlaybackUrl } from "@/lib/recordings.functions";

export function CallRecordingPlayer({ callId, autoLoad = false }: { callId: string; autoLoad?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const getUrl = useServerFn(getCallRecordingPlaybackUrl);

  async function load() {
    if (url || loading) return;
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

  useEffect(() => {
    if (autoLoad) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad, callId]);

  if (url) {
    return (
      <div className="flex items-center gap-2">
        <audio controls preload="metadata" src={url} className="h-9 w-full max-w-80" />
        <Button asChild size="icon" variant="ghost" aria-label="Download recording"><a href={url} download={`call-${callId}.wav`}><Download /></a></Button>
      </div>
    );
  }
  return (
    <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void load()}>
      {loading ? <Loader2 className="animate-spin" /> : <Play />}
      Listen
    </Button>
  );
}
