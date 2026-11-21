import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Bookmark, Heart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useApp, compact } from "@/lib/app-context";
import { queryClient } from "@/lib/queryClient";
import { isBookmarked, setBookmark, likeState, toggleTitleLike, seriesLiked, toggleSeriesLike } from "@/lib/data";
import { errMsg } from "@/lib/supabase";

export type SaveMeta = { series_key: string; title: string; cover: string | null; kind: string | null; href: string; series_id?: string | null };

export function SaveButton({ meta }: { meta: SaveMeta }) {
  const { user, openAuth } = useApp();
  const { toast } = useToast();
  const key = ["bookmark", user?.id, meta.series_key];
  const q = useQuery({ queryKey: key, queryFn: () => isBookmarked(user!.id, meta.series_key), enabled: !!user });
  const m = useMutation({
    mutationFn: (on: boolean) => setBookmark(user!.id, on, meta),
    onMutate: (on) => queryClient.setQueryData(key, on),
    onSuccess: (_d, on) => { queryClient.invalidateQueries({ queryKey: ["bookmarks"] }); toast({ title: on ? "Saved to your library" : "Removed from your library" }); },
    onError: (e, on) => { queryClient.setQueryData(key, !on); toast({ title: "Couldn't update library", description: errMsg(e), variant: "destructive" }); },
  });
  const saved = !!q.data;
  return (
    <Button variant={saved ? "secondary" : "outline"} className="gap-2 rounded-full" disabled={m.isPending || (!!user && q.isLoading)}
      onClick={() => (user ? m.mutate(!saved) : openAuth("login"))} aria-pressed={saved} data-testid="button-save">
      {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className={`h-4 w-4 ${saved ? "fill-primary text-primary" : ""}`} />}{saved ? "Saved" : "Save"}
    </Button>
  );
}

/** Like for catalogue titles (AniList id) or hosted series (uuid). */
export function LikeButton({ mediaId, seriesId, title, cover, kind, initialCount }: { mediaId?: number; seriesId?: string; title: string; cover: string | null; kind: string | null; initialCount?: number }) {
  const { user, openAuth } = useApp();
  const { toast } = useToast();
  const key = ["like", user?.id ?? "anon", mediaId ?? seriesId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (mediaId) { const s = (await likeState([mediaId]))[mediaId]; return { liked: !!s?.liked, count: s?.count ?? 0 }; }
      return { liked: user ? await seriesLiked(user.id, seriesId!) : false, count: initialCount ?? 0 };
    },
  });
  const [local, setLocal] = useState<{ liked: boolean; count: number } | null>(null);
  const state = local ?? q.data ?? { liked: false, count: initialCount ?? 0 };
  const m = useMutation({
    mutationFn: () => (mediaId ? toggleTitleLike(mediaId, title, cover, kind) : toggleSeriesLike(seriesId!)),
    onMutate: () => setLocal({ liked: !state.liked, count: Math.max(0, state.count + (state.liked ? -1 : 1)) }),
    onSuccess: (d) => { setLocal({ liked: d.liked, count: Number(d.count ?? 0) }); queryClient.invalidateQueries({ queryKey: ["community-top"] }); },
    onError: (e) => { setLocal(null); toast({ title: "Couldn't update like", description: errMsg(e), variant: "destructive" }); },
  });
  return (
    <Button variant={state.liked ? "default" : "outline"} className="gap-2 rounded-full" onClick={() => (user ? m.mutate() : openAuth("login"))} aria-pressed={state.liked} disabled={m.isPending} data-testid="button-like">
      <motion.span key={String(state.liked)} initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 14 }}>
        <Heart className={`h-4 w-4 ${state.liked ? "fill-current" : ""}`} />
      </motion.span>
      <span className="tabular-nums" data-testid="text-like-count">{compact(state.count)}</span>
    </Button>
  );
}
