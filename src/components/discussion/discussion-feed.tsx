"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  MessageSquare,
  Heart,
  Pin,
  Send,
  ChevronDown,
  ChevronUp,
  Loader2,
  User,
  Clock,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────
interface PostUser {
  id: string;
  name: string | null;
  image: string | null;
  username: string | null;
}

interface DiscussionPost {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  user: PostUser;
  _count: { comments: number; likes: number };
}

interface DiscussionComment {
  id: string;
  content: string;
  createdAt: string;
  user: PostUser;
  _count: { likes: number };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ─── Relative time ──────────────────────────────────────────
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return "Adesso";
  if (mins < 60) return `${mins}m fa`;
  if (hours < 24) return `${hours}h fa`;
  if (days < 30) return `${days}g fa`;
  if (days < 365) return `${Math.floor(days / 30)} mesi fa`;
  return `${Math.floor(days / 365)} anni fa`;
}

function displayName(u: PostUser) {
  return u.name || u.username || "Utente";
}

// ─── Props ──────────────────────────────────────────────────
interface DiscussionFeedProps {
  productSlug: string;
  isAuthenticated: boolean;
  currentUserId?: string;
  currentUserName?: string;
  currentUserImage?: string;
}

// ─── Component ──────────────────────────────────────────────
export function DiscussionFeed({
  productSlug,
  isAuthenticated,
  currentUserId,
  currentUserName,
  currentUserImage,
}: DiscussionFeedProps) {
  // Post state
  const [posts, setPosts] = useState<DiscussionPost[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New post form
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Comments state
  const [commentsState, setCommentsState] = useState<
    Record<string, { comments: DiscussionComment[]; loading: boolean; open: boolean; page: number; totalPages: number }>
  >({});

  // Reply form state
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});
  const [replySubmitting, setReplySubmitting] = useState<Record<string, boolean>>({});

  // Liked posts + counts (synced with server)
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});

  // Abort controller for comment fetches
  const [, setCommentAbort] = useState<Record<string, AbortController>>({});

  // ── Fetch posts ────────────────────────────────────────
  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/discussions/${productSlug}?limit=20`);
      if (!res.ok) throw new Error("Errore nel caricamento");
      const data = await res.json();
      setPosts(data.posts);
      setPagination(data.pagination);
      // Init like counts + rebuild liked set from server
      const counts: Record<string, number> = {};
      const liked = new Set<string>();
      data.posts.forEach((p: DiscussionPost) => {
        counts[p.id] = p._count.likes;
      });
      setLikeCounts(counts);
      setLikedPosts(liked);
    } catch (e) {
      setError("Impossibile caricare le discussioni");
    } finally {
      setLoading(false);
    }
  }, [productSlug]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // ── Create post ────────────────────────────────────────
  const handleCreatePost = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/discussions/${productSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), content: newContent.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Errore");
      }
      const data = await res.json();
      setPosts((prev) => [data.post, ...prev]);
      setNewTitle("");
      setNewContent("");
      setShowForm(false);
      // Update like count for new post
      setLikeCounts((prev) => ({ ...prev, [data.post.id]: 0 }));
    } catch (e: any) {
      alert(e.message || "Errore nella creazione del post");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Toggle comments ────────────────────────────────────
  const toggleComments = async (postId: string) => {
    const current = commentsState[postId];
    if (current?.open) {
      setCommentsState((prev) => ({ ...prev, [postId]: { ...prev[postId], open: false } }));
      return;
    }
    // Open and fetch if not loaded
    setCommentsState((prev) => ({
      ...prev,
      [postId]: { comments: [], loading: true, open: true, page: 1, totalPages: 1 },
    }));
    try {
      const res = await fetch(`/api/discussions/${postId}/comments?limit=30`);
      if (!res.ok) throw new Error("Errore");
      const data = await res.json();
      setCommentsState((prev) => ({
        ...prev,
        [postId]: { comments: data.comments, loading: false, open: true, page: data.pagination.page, totalPages: data.pagination.totalPages },
      }));
    } catch {
      setCommentsState((prev) => ({
        ...prev,
        [postId]: { ...prev[postId], loading: false },
      }));
    }
  };

  // ── Reply to post ──────────────────────────────────────
  const handleReply = async (postId: string) => {
    const content = replyContent[postId]?.trim();
    if (!content) return;
    setReplySubmitting((prev) => ({ ...prev, [postId]: true }));
    try {
      const res = await fetch(`/api/discussions/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Errore");
      }
      const data = await res.json();
      setCommentsState((prev) => ({
        ...prev,
        [postId]: {
          ...prev[postId],
          comments: [...prev[postId].comments, data.comment],
        },
      }));
      setReplyContent((prev) => ({ ...prev, [postId]: "" }));
      // Update post comment count
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, _count: { ...p._count, comments: p._count.comments + 1 } } : p
        )
      );
    } catch (e: any) {
      alert(e.message || "Errore nell'invio del commento");
    } finally {
      setReplySubmitting((prev) => ({ ...prev, [postId]: false }));
    }
  };

  // ── Toggle like ────────────────────────────────────────
  const toggleLike = async (postId: string) => {
    const wasLiked = likedPosts.has(postId);
    // Optimistic update
    setLikedPosts((prev) => {
      const next = new Set(prev);
      wasLiked ? next.delete(postId) : next.add(postId);
      return next;
    });
    setLikeCounts((prev) => ({
      ...prev,
      [postId]: (prev[postId] || 0) + (wasLiked ? -1 : 1),
    }));
    try {
      const res = await fetch(`/api/discussions/${postId}/like`, { method: "POST" });
      const data = await res.json();        if (!res.ok || !data.liked) {
          // Revert on server disagreement
          setLikedPosts((prev) => {
            const next = new Set(prev);
            data.liked ? next.add(postId) : next.delete(postId);
            return next;
          });
          // Re-fetch to sync counts
          fetchPosts();
        }
    } catch {
      // Revert optimistic
      setLikedPosts((prev) => {
        const next = new Set(prev);
        wasLiked ? next.add(postId) : next.delete(postId);
        return next;
      });
      setLikeCounts((prev) => ({
        ...prev,
        [postId]: (prev[postId] || 0) + (wasLiked ? 1 : -1),
      }));
    }
  };

  // ── Sorted: pinned first, then by date ─────────────────
  const sortedPosts = useMemo(
    () =>
      [...posts].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    [posts]
  );

  const displayNameFn = displayName;

  // ── Render ─────────────────────────────────────────────
  return (
    <section className="space-y-5" id="discussions">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cream-dark-surface border border-cream-dark-border flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-cream-dark-gold" />
          </div>
          <div>
            <h2 className="font-serif text-2xl text-cream-dark-text tracking-tight">
              Community
            </h2>
            <p className="text-xs text-cream-dark-text-soft font-light mt-0.5">
              {posts.length} {posts.length === 1 ? "discussione" : "discussioni"}
            </p>
          </div>
        </div>
        {isAuthenticated && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2.5 bg-cream-dark-gold/15 border border-cream-dark-gold/30 rounded-xl text-xs font-semibold text-cream-dark-gold hover:bg-cream-dark-gold/20 transition-all"
          >
            {showForm ? "Annulla" : "Nuova discussione"}
          </button>
        )}
      </div>

      {/* Create Post Form */}
      {showForm && isAuthenticated && (
        <div className="bg-cream-dark-surface border border-cream-dark-border rounded-2xl p-6 space-y-4">
          <input
            type="text"
            placeholder="Titolo della discussione..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            maxLength={200}
            className="w-full bg-cream-dark-bg border border-cream-dark-border rounded-xl px-4 py-3 text-sm text-cream-dark-text placeholder:text-cream-dark-text-soft focus:outline-none focus:border-cream-dark-gold/50 transition-colors"
          />
          <textarea
            placeholder="Scrivi il tuo messaggio..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            maxLength={10000}
            rows={4}
            className="w-full bg-cream-dark-bg border border-cream-dark-border rounded-xl px-4 py-3 text-sm text-cream-dark-text placeholder:text-cream-dark-text-soft focus:outline-none focus:border-cream-dark-gold/50 transition-colors resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-cream-dark-text-soft">
              {newContent.length}/10000
            </span>
            <button
              onClick={handleCreatePost}
              disabled={submitting || !newTitle.trim() || !newContent.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-cream-dark-gold text-cream-dark-bg rounded-xl text-xs font-bold disabled:opacity-40 hover:opacity-90 transition-all"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Pubblica
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-cream-dark-gold animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="text-center py-12">
          <p className="text-cream-dark-text-soft text-sm">{error}</p>
          <button
            onClick={fetchPosts}
            className="mt-3 px-4 py-2 text-xs font-semibold text-cream-dark-gold hover:underline"
          >
            Riprova
          </button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && posts.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-cream-dark-surface border border-cream-dark-border flex items-center justify-center">
            <MessageSquare className="w-7 h-7 text-cream-dark-text-soft" />
          </div>
          <p className="text-cream-dark-text-soft text-sm">
            Nessuna discussione ancora. Sii il primo a iniziare!
          </p>
          {!isAuthenticated && (
            <a
              href="/login"
              className="inline-block mt-2 px-5 py-2.5 bg-cream-dark-gold/15 border border-cream-dark-gold/30 rounded-xl text-xs font-semibold text-cream-dark-gold hover:bg-cream-dark-gold/20 transition-all"
            >
              Accedi per partecipare
            </a>
          )}
        </div>
      )}

      {/* Posts List */}
      {!loading && !error && sortedPosts.length > 0 && (
        <div className="space-y-4">
          {sortedPosts.map((post) => {
            const cs = commentsState[post.id];
            const commentCount = post._count.comments;
            const likeCount = likeCounts[post.id] ?? post._count.likes;
            const isLiked = likedPosts.has(post.id);

            return (
              <div
                key={post.id}
                className={`bg-cream-dark-surface border rounded-2xl overflow-hidden transition-all ${
                  post.pinned
                    ? "border-cream-dark-gold/25 ring-1 ring-cream-dark-gold/10"
                    : "border-cream-dark-border"
                }`}
              >
                <div className="p-5">
                  {/* Pinned badge */}
                  {post.pinned && (
                    <div className="flex items-center gap-1.5 mb-3">
                      <Pin className="w-3.5 h-3.5 text-cream-dark-gold" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-cream-dark-gold">
                        In evidenza
                      </span>
                    </div>
                  )}

                  {/* Author row */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FFF5E6] to-[#FFE4C4] flex items-center justify-center overflow-hidden shrink-0">
                      {post.user.image ? (
                        <img src={post.user.image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-4 h-4 text-cream-dark-gold" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-cream-dark-text truncate">
                        {displayNameFn(post.user)}
                      </p>
                      <div className="flex items-center gap-1 text-[11px] text-cream-dark-text-soft">
                        <Clock className="w-3 h-3" />
                        {relativeTime(post.createdAt)}
                      </div>
                    </div>
                  </div>

                  {/* Title + Content */}
                  <h3 className="font-serif text-lg text-cream-dark-text font-semibold mb-2">
                    {post.title}
                  </h3>
                  <p className="text-sm text-cream-dark-text-soft leading-relaxed whitespace-pre-line line-clamp-5">
                    {post.content}
                  </p>

                  {/* Actions row */}
                  <div className="flex items-center gap-5 mt-4 pt-3 border-t border-cream-dark-border">
                    {/* Like */}
                    <button
                      type="button"
                      onClick={() => toggleLike(post.id)}
                      disabled={!isAuthenticated}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium transition-all ${
                        isLiked
                          ? "text-red-400"
                          : "text-cream-dark-text-soft hover:text-red-400"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <Heart className={`w-4 h-4 ${isLiked ? "fill-current" : ""}`} />
                      {likeCount > 0 && <span>{likeCount}</span>}
                    </button>

                    {/* Comments toggle */}
                    <button
                      type="button"
                      onClick={() => toggleComments(post.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-cream-dark-text-soft hover:text-cream-dark-gold transition-all"
                    >
                      <MessageSquare className="w-4 h-4" />
                      {commentCount > 0 && <span>{commentCount}</span>}
                      {cs?.open ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Comments section */}
                {cs?.open && (
                  <div className="border-t border-cream-dark-border bg-cream-dark-bg/40 px-5 py-4 space-y-4">
                    {/* Loading comments */}
                    {cs.loading && (
                      <div className="flex items-center gap-2 py-3">
                        <Loader2 className="w-4 h-4 text-cream-dark-gold animate-spin" />
                        <span className="text-xs text-cream-dark-text-soft">Caricamento commenti...</span>
                      </div>
                    )}

                    {/* Comment list */}
                    {!cs.loading && cs.comments.length > 0 && (
                      <div className="space-y-3">
                        {cs.comments.map((comment) => (
                          <div key={comment.id} className="flex gap-3">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FFF5E6] to-[#FFE4C4] flex items-center justify-center overflow-hidden shrink-0 mt-0.5">
                              {comment.user.image ? (
                                <img src={comment.user.image} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <User className="w-3 h-3 text-cream-dark-gold" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-cream-dark-text">
                                  {displayNameFn(comment.user)}
                                </span>
                                <span className="text-[10px] text-cream-dark-text-soft">
                                  {relativeTime(comment.createdAt)}
                                </span>
                              </div>
                              <p className="text-sm text-cream-dark-text-soft mt-0.5 whitespace-pre-line">
                                {comment.content}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* No comments */}
                    {!cs.loading && cs.comments.length === 0 && (
                      <p className="text-xs text-cream-dark-text-soft py-2">
                        Nessun commento. Scrivi il primo!
                      </p>
                    )}

                    {/* Reply form */}
                    {isAuthenticated && (
                      <div className="flex gap-3 pt-2 border-t border-cream-dark-border">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FFF5E6] to-[#FFE4C4] flex items-center justify-center overflow-hidden shrink-0 mt-1">
                          {currentUserImage ? (
                            <img src={currentUserImage} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-3 h-3 text-cream-dark-gold" />
                          )}
                        </div>
                        <div className="flex-1 flex gap-2">
                          <input
                            type="text"
                            placeholder="Scrivi un commento..."
                            value={replyContent[post.id] || ""}
                            onChange={(e) =>
                              setReplyContent((prev) => ({ ...prev, [post.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleReply(post.id);
                              }
                            }}
                            maxLength={5000}
                            className="flex-1 bg-cream-dark-bg border border-cream-dark-border rounded-lg px-3 py-2 text-xs text-cream-dark-text placeholder:text-cream-dark-text-soft focus:outline-none focus:border-cream-dark-gold/50 transition-colors"
                          />
                          <button
                            onClick={() => handleReply(post.id)}
                            disabled={!replyContent[post.id]?.trim() || replySubmitting[post.id]}
                            className="px-3 py-2 bg-cream-dark-gold text-cream-dark-bg rounded-lg text-xs font-bold disabled:opacity-40 hover:opacity-90 transition-all shrink-0"
                          >
                            {replySubmitting[post.id] ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const res = await fetch(
                        `/api/discussions/${productSlug}?page=${p}&limit=20`
                      );
                      const data = await res.json();
                      setPosts(data.posts);
                      setPagination(data.pagination);
                    } catch {
                      // keep current state
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className={`w-9 h-9 rounded-lg text-xs font-semibold transition-all ${
                    p === pagination.page
                      ? "bg-cream-dark-gold/20 text-cream-dark-gold border border-cream-dark-gold/30"
                      : "bg-cream-dark-surface border border-cream-dark-border text-cream-dark-text-soft hover:text-cream-dark-gold"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
