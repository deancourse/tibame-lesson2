import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  createVehicleSchema,
  type CreateVehicleInput,
  VEHICLE_COLORS,
  VEHICLE_MAKES,
  VEHICLE_STATUSES,
  type VehicleStatus,
} from "@vms/shared";
import { ApiError, apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_LABELS: Record<VehicleStatus, string> = {
  AVAILABLE: "可用",
  MAINTENANCE: "維修中",
  RETIRED: "報廢",
};

const STATUS_BADGE: Record<VehicleStatus, string> = {
  AVAILABLE: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  MAINTENANCE: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  RETIRED: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
};

interface VehicleRow {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  color: string;
  status: VehicleStatus;
  mileage: number;
  purchasedAt: string;
  ownerId: string | null;
  owner: { name: string; employeeNo: string; status: "ACTIVE" | "INACTIVE" } | null;
}

interface EmployeeOption {
  id: string;
  name: string;
  employeeNo: string;
  status: "ACTIVE" | "INACTIVE";
}

interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const OWNER_NONE = "__NONE__";

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// 員工清單（含 INACTIVE）供「指派 owner」下拉使用，下拉只取 ACTIVE（見 VehicleSheet），與 API 的 assertActiveOwner 一致。
// owner 姓名顯示改由 /vehicles 後端 join 帶回（含 status 判斷是否離職），不再依賴此清單。
function useEmployeesLookup(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["employees", "lookup-all"],
    queryFn: async () => {
      const { data } = await apiClient.get<Page<EmployeeOption>>("/employees", {
        params: { status: "ALL", pageSize: 100 },
      });
      return data.items;
    },
    staleTime: 60_000,
  });
}

export function VehiclesPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "ADMIN";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | VehicleStatus>("ALL");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search, 300);

  const list = useQuery({
    queryKey: ["vehicles", { search: debounced, status, page }],
    queryFn: async () => {
      const { data } = await apiClient.get<Page<VehicleRow>>("/vehicles", {
        params: { search: debounced || undefined, status, page, pageSize: 20 },
      });
      return data;
    },
  });

  const employees = useEmployeesLookup(isAdmin);

  const describeOwner = (v: VehicleRow) => {
    if (!v.ownerId) return "—";
    if (!isAdmin) return user?.name ?? "本人";
    if (!v.owner) return v.ownerId.slice(0, 8) + "…";
    const label = `${v.owner.name}（${v.owner.employeeNo}）`;
    return v.owner.status === "INACTIVE" ? `${label} · 已離職` : label;
  };

  const [editing, setEditing] = useState<VehicleRow | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<VehicleRow | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/vehicles/${id}`),
    onSuccess: () => {
      toast.success("車輛已刪除");
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "刪除失敗");
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">車輛管理</h1>
        <p className="text-sm text-muted-foreground">維護車輛資料、狀態、負責人員與里程紀錄。</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card/70 p-3 backdrop-blur-sm">
        <div className="flex-1 min-w-[200px] max-w-xs">
          <Label htmlFor="search">搜尋</Label>
          <Input
            id="search"
            placeholder="車牌 / 廠牌 / 車型"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-40">
          <Label>狀態</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as "ALL" | VehicleStatus)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部</SelectItem>
              {VEHICLE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1" />
        {isAdmin && (
          <Button
            onClick={() => setEditing("new")}
            className="bg-brand-gradient text-white shadow-glow hover:opacity-95"
          >
            新增車輛
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card/70 backdrop-blur-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>車牌</TableHead>
              <TableHead>廠牌</TableHead>
              <TableHead>車型</TableHead>
              <TableHead>年份</TableHead>
              <TableHead>顏色</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead className="text-right">里程</TableHead>
              <TableHead>購買日</TableHead>
              <TableHead>負責員工</TableHead>
              {isAdmin && <TableHead className="text-right">操作</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data?.items.map((v, idx) => (
              <TableRow
                key={v.id}
                className="row-in transition hover:-translate-y-px hover:shadow-card-lift"
                style={{ animationDelay: `${Math.min(idx, 20) * 30}ms` }}
              >
                <TableCell className="font-medium">{v.plate}</TableCell>
                <TableCell>{v.make}</TableCell>
                <TableCell>{v.model}</TableCell>
                <TableCell>{v.year}</TableCell>
                <TableCell>{v.color}</TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[v.status]}`}
                  >
                    {STATUS_LABELS[v.status]}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {v.mileage.toLocaleString()}
                </TableCell>
                <TableCell>{v.purchasedAt.slice(0, 10)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {describeOwner(v)}
                </TableCell>
                {isAdmin && (
                  <TableCell className="space-x-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => setEditing(v)}>
                      編輯
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setConfirmDelete(v)}
                    >
                      刪除
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {list.data && list.data.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 10 : 9} className="py-12 text-center text-muted-foreground">
                  尚無車輛
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
            第 {list.data.page} / {list.data.totalPages} 頁
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

      {isAdmin && editing !== null && (
        <VehicleSheet
          editing={editing}
          employees={employees.data ?? []}
          onClose={() => setEditing(null)}
          onSuccess={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["vehicles"] });
          }}
        />
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              即將刪除車輛 {confirmDelete?.plate}，此動作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && remove.mutate(confirmDelete.id)}
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function VehicleSheet({
  editing,
  employees,
  onClose,
  onSuccess,
}: {
  editing: VehicleRow | "new";
  employees: EmployeeOption[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isNew = editing === "new";
  const defaultValues = useMemo<Partial<CreateVehicleInput>>(() => {
    if (isNew)
      return {
        status: "AVAILABLE",
        year: new Date().getFullYear(),
        mileage: 0,
        make: VEHICLE_MAKES[0],
        color: VEHICLE_COLORS[0],
      };
    const v = editing as VehicleRow;
    return {
      plate: v.plate,
      make: v.make as (typeof VEHICLE_MAKES)[number],
      model: v.model,
      year: v.year,
      color: v.color as (typeof VEHICLE_COLORS)[number],
      status: v.status,
      mileage: v.mileage,
      // date input 需要 YYYY-MM-DD 字串才能正確回填；提交時由 z.coerce.date() 轉回 Date。
      purchasedAt: v.purchasedAt.slice(0, 10) as unknown as Date,
      ownerId: v.ownerId ?? undefined,
    };
  }, [editing, isNew]);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateVehicleInput>({
    resolver: zodResolver(createVehicleSchema),
    defaultValues,
  });

  const submit = handleSubmit(async (values) => {
    try {
      const payload = {
        ...values,
        ownerId: values.ownerId ? values.ownerId : null,
      };
      if (isNew) {
        await apiClient.post("/vehicles", payload);
        toast.success(`已新增車輛 ${values.plate}`);
      } else {
        await apiClient.patch(`/vehicles/${(editing as VehicleRow).id}`, payload);
        toast.success(`已更新車輛 ${values.plate}`);
      }
      onSuccess();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "操作失敗");
    }
  });

  const textFields = [
    { name: "plate", label: "車牌", type: "text" },
    { name: "model", label: "車型", type: "text" },
    { name: "year", label: "年份", type: "number" },
    { name: "mileage", label: "里程數", type: "number" },
    { name: "purchasedAt", label: "購買日期", type: "date" },
  ] as const;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isNew ? "新增車輛" : `編輯 ${(editing as VehicleRow).plate}`}
          </SheetTitle>
        </SheetHeader>
        <form onSubmit={submit} className="mt-2 grid grid-cols-2 gap-3">
          {textFields.map((f) => (
            <div key={f.name} className="space-y-1.5">
              <Label htmlFor={f.name}>{f.label}</Label>
              <Input
                id={f.name}
                type={f.type}
                {...register(f.name as "plate", {
                  valueAsNumber: f.type === "number",
                })}
              />
              {errors[f.name as keyof CreateVehicleInput] && (
                <p className="text-xs text-destructive">
                  {(errors[f.name as keyof CreateVehicleInput] as { message?: string })?.message}
                </p>
              )}
            </div>
          ))}
          <FormSelect
            control={control}
            name="make"
            label="廠牌"
            options={VEHICLE_MAKES}
            error={errors.make?.message}
          />
          <FormSelect
            control={control}
            name="color"
            label="顏色"
            options={VEHICLE_COLORS}
            error={errors.color?.message}
          />
          <FormSelect
            control={control}
            name="status"
            label="狀態"
            options={VEHICLE_STATUSES}
            renderOption={(s) => STATUS_LABELS[s as VehicleStatus]}
            error={errors.status?.message}
          />
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="ownerId">負責員工</Label>
            <Controller
              control={control}
              name="ownerId"
              render={({ field }) => (
                <Select
                  value={field.value ? field.value : OWNER_NONE}
                  onValueChange={(v) => field.onChange(v === OWNER_NONE ? null : v)}
                >
                  <SelectTrigger id="ownerId">
                    <SelectValue placeholder="選擇負責員工" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={OWNER_NONE}>未指派</SelectItem>
                    {employees
                      .filter((e) => e.status === "ACTIVE")
                      .map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name}（{e.employeeNo}）
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.ownerId?.message && (
              <p className="text-xs text-destructive">{errors.ownerId.message}</p>
            )}
          </div>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-brand-gradient text-white shadow-glow hover:opacity-95"
            >
              {isNew ? "新增" : "儲存"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

interface FormSelectProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
  name: "make" | "color" | "status";
  label: string;
  options: readonly string[];
  error?: string;
  renderOption?: (v: string) => string;
}

function FormSelect({ control, name, label, options, error, renderOption }: FormSelectProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select value={field.value ?? ""} onValueChange={field.onChange}>
            <SelectTrigger id={name}>
              <SelectValue placeholder={`選擇${label}`} />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o} value={o}>
                  {renderOption ? renderOption(o) : o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
