import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Braces, Check, Eye, EyeOff } from "lucide-react";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_OUTCOMES,
  type AuditLogDTO,
  type AuditOutcome,
} from "@vms/shared";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/MultiSelect";
import { displayIp } from "@/lib/ip";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const OUTCOME_LABELS: Record<AuditOutcome, string> = {
  SUCCESS: "成功",
  FAILURE: "失敗",
};

const OUTCOME_BADGE: Record<AuditOutcome, string> = {
  SUCCESS: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  FAILURE: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
};

const ACTION_OPTIONS = AUDIT_ACTIONS.map((a) => ({
  value: a,
  label: AUDIT_ACTION_LABELS[a],
}));

const OUTCOME_OPTIONS = AUDIT_OUTCOMES.map((o) => ({
  value: o,
  label: OUTCOME_LABELS[o],
}));

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function formatTime(iso: string): string {
  return iso.replace("T", " ").slice(0, 19);
}

function describeTarget(a: AuditLogDTO): string {
  if (!a.targetType) return "—";
  return a.targetId ? `${a.targetType}（${a.targetId.slice(0, 8)}…）` : a.targetType;
}

function actionLabel(action: string): string {
  return (AUDIT_ACTION_LABELS as Record<string, string>)[action] ?? action;
}

// 判斷 metadata 是否含「實質」參數：空物件或只有空的 params 視為無參數。
function hasParams(metadata: unknown): boolean {
  if (metadata == null || typeof metadata !== "object") return false;
  const obj = metadata as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;
  if (keys.length === 1 && "params" in obj) {
    const params = obj.params;
    if (
      params != null &&
      typeof params === "object" &&
      Object.keys(params as object).length === 0
    ) {
      return false;
    }
  }
  return true;
}

// 將文字寫入剪貼簿；clipboard API 不可用（非安全環境）時退回 execCommand。
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
  }
}

// 「API 參數」欄：精簡的「檢視」觸發點。hover 浮出自訂卡片顯示格式化 metadata；
// 點擊則複製完整 JSON 至剪貼簿並短暫顯示「已複製」回饋。
// 浮卡採 fixed 定位（依觸發點 bounding rect 計算），並以 portal 掛到 document.body，
// 避免被表格的 overflow-auto 裁切、或被列進場動畫殘留的 transform 變成相對定位。
function ParamCell({ metadata }: { metadata: unknown }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    placement: "top" | "bottom";
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  if (!hasParams(metadata)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const full = JSON.stringify(metadata, null, 2);

  function show() {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    // 下方空間不足且上方較寬裕時，往上開
    const placement: "top" | "bottom" =
      spaceBelow < 220 && rect.top > spaceBelow ? "top" : "bottom";
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 360));
    setCoords({
      top: placement === "bottom" ? rect.bottom + 6 : rect.top - 6,
      left,
      placement,
    });
  }

  async function handleCopy() {
    await copyToClipboard(full);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={show}
        onMouseLeave={() => setCoords(null)}
        onFocus={show}
        onBlur={() => setCoords(null)}
        onClick={handleCopy}
        aria-label={copied ? "已複製參數" : "檢視並複製參數"}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs transition-colors",
          copied
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
            : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {copied ? <Check className="h-3 w-3" /> : <Braces className="h-3 w-3" />}
        {copied ? "已複製" : "檢視"}
      </button>
      {coords &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              transform: coords.placement === "top" ? "translateY(-100%)" : undefined,
            }}
            className="pointer-events-none z-50 max-h-[60vh] w-max max-w-[22rem] overflow-hidden rounded-lg border bg-popover p-3 text-popover-foreground shadow-xl"
          >
            <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed">
              {full}
            </pre>
          </div>,
          document.body,
        )}
    </>
  );
}

export function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [actions, setActions] = useState<string[]>([]);
  const [outcomes, setOutcomes] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [ipMasked, setIpMasked] = useState(true);
  const debounced = useDebounced(search, 300);

  const list = useQuery({
    queryKey: ["audit-logs", { search: debounced, actions, outcomes, from, to, page }],
    queryFn: async () => {
      const { data } = await apiClient.get<Page<AuditLogDTO>>("/audit-logs", {
        params: {
          search: debounced || undefined,
          action: actions.length ? actions.join(",") : undefined,
          outcome: outcomes.length ? outcomes.join(",") : undefined,
          from: from || undefined,
          to: to || undefined,
          page,
          pageSize: 20,
        },
      });
      return data;
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">操作紀錄</h1>
        <p className="text-sm text-muted-foreground">
          稽核系統中使用者的登入、資料異動與讀取行為（僅供管理者查看）。
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card/70 p-3 backdrop-blur-sm">
        <div className="flex-1 min-w-[180px] max-w-xs">
          <Label htmlFor="search">操作者</Label>
          <Input
            id="search"
            placeholder="帳號關鍵字（可逗號分隔多個）"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
        </div>
        <div className="w-48">
          <Label>動作</Label>
          <MultiSelect
            options={ACTION_OPTIONS}
            selected={actions}
            onChange={(next) => {
              setPage(1);
              setActions(next);
            }}
            placeholder="全部動作"
            label="選擇動作"
          />
        </div>
        <div className="w-40">
          <Label>結果</Label>
          <MultiSelect
            options={OUTCOME_OPTIONS}
            selected={outcomes}
            onChange={(next) => {
              setPage(1);
              setOutcomes(next);
            }}
            placeholder="全部結果"
            label="選擇結果"
          />
        </div>
        <div className="w-40">
          <Label htmlFor="from">起始日</Label>
          <Input
            id="from"
            type="date"
            value={from}
            onChange={(e) => {
              setPage(1);
              setFrom(e.target.value);
            }}
          />
        </div>
        <div className="w-40">
          <Label htmlFor="to">結束日</Label>
          <Input
            id="to"
            type="date"
            value={to}
            onChange={(e) => {
              setPage(1);
              setTo(e.target.value);
            }}
          />
        </div>
      </div>

      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIpMasked((m) => !m)}
          aria-pressed={ipMasked}
        >
          {ipMasked ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
          來源 IP：{ipMasked ? "遮蔽中" : "顯示完整"}
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card/70 backdrop-blur-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>時間</TableHead>
              <TableHead>操作者</TableHead>
              <TableHead>動作</TableHead>
              <TableHead>目標</TableHead>
              <TableHead>結果</TableHead>
              <TableHead>狀態碼</TableHead>
              <TableHead>API 參數</TableHead>
              <TableHead>來源 IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data?.items.map((a, idx) => (
              <TableRow
                key={a.id}
                className="row-in transition hover:-translate-y-px hover:shadow-card-lift"
                style={{ animationDelay: `${Math.min(idx, 20) * 30}ms` }}
              >
                <TableCell className="whitespace-nowrap font-mono text-xs">
                  {formatTime(a.createdAt)}
                </TableCell>
                <TableCell>{a.actorUsername ?? "—"}</TableCell>
                <TableCell>{actionLabel(a.action)}</TableCell>
                <TableCell className="text-muted-foreground">{describeTarget(a)}</TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_BADGE[a.outcome]}`}
                  >
                    {OUTCOME_LABELS[a.outcome]}
                  </span>
                </TableCell>
                <TableCell className="tabular-nums">{a.statusCode}</TableCell>
                <TableCell>
                  <ParamCell metadata={a.metadata} />
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {displayIp(a.ip, ipMasked)}
                </TableCell>
              </TableRow>
            ))}
            {list.data && list.data.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                  尚無紀錄
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {list.data && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            上一頁
          </Button>
          <span className="text-sm text-muted-foreground">
            第 {list.data.page} / {list.data.totalPages} 頁（共 {list.data.total} 筆）
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= list.data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一頁
          </Button>
        </div>
      )}
    </div>
  );
}
