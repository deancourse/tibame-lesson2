import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  createEmployeeSchema,
  resetPasswordSchema,
  type CreateEmployeeInput,
  type ResetPasswordInput,
  DEPARTMENTS,
  EMPLOYEE_STATUSES,
  type EmployeeStatus,
  POSITIONS,
  ROLES,
  type Role,
} from "@vms/shared";
import { ApiError, apiClient } from "@/lib/api";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: "在職",
  INACTIVE: "離職",
};

const STATUS_BADGE: Record<EmployeeStatus, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  INACTIVE: "bg-muted text-muted-foreground",
};

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "管理員",
  USER: "一般使用者",
};

interface EmployeeRow {
  id: string;
  employeeNo: string;
  name: string;
  email: string;
  department: string;
  position: string;
  hiredAt: string;
  phone: string;
  status: EmployeeStatus;
  username: string;
  role: Role;
}

interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function EmployeesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState<"" | (typeof DEPARTMENTS)[number]>("");
  const [status, setStatus] = useState<"ALL" | EmployeeStatus>("ACTIVE");
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: ["employees", { search, department, status, page }],
    queryFn: async () => {
      const { data } = await apiClient.get<Page<EmployeeRow>>("/employees", {
        params: {
          search: search || undefined,
          department: department || undefined,
          status,
          page,
          pageSize: 20,
        },
      });
      return data;
    },
  });

  const [editing, setEditing] = useState<EmployeeRow | "new" | null>(null);
  const [resetting, setResetting] = useState<EmployeeRow | null>(null);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">員工管理</h1>
        <p className="text-sm text-muted-foreground">維護員工資料、部門、角色與帳號狀態。</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card/70 p-3 backdrop-blur-sm">
        <div className="flex-1 min-w-[200px] max-w-xs">
          <Label htmlFor="search">搜尋</Label>
          <Input
            id="search"
            placeholder="姓名 / 工號 / Email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-40">
          <Label>部門</Label>
          <Select
            value={department || "ALL"}
            onValueChange={(v) =>
              setDepartment(v === "ALL" ? "" : (v as (typeof DEPARTMENTS)[number]))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部部門</SelectItem>
              {DEPARTMENTS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Label>狀態</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as "ALL" | EmployeeStatus)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">在職</SelectItem>
              <SelectItem value="INACTIVE">離職</SelectItem>
              <SelectItem value="ALL">全部</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1" />
        <Button
          onClick={() => setEditing("new")}
          className="bg-brand-gradient text-white shadow-glow hover:opacity-95"
        >
          新增員工
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card/70 backdrop-blur-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>工號</TableHead>
              <TableHead>姓名</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>部門</TableHead>
              <TableHead>職位</TableHead>
              <TableHead>入職日</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead>角色</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data?.items.map((e, idx) => (
              <TableRow
                key={e.id}
                className="row-in transition hover:-translate-y-px hover:shadow-card-lift"
                style={{ animationDelay: `${Math.min(idx, 20) * 30}ms` }}
              >
                <TableCell className="font-medium">{e.employeeNo}</TableCell>
                <TableCell>{e.name}</TableCell>
                <TableCell className="text-muted-foreground">{e.email}</TableCell>
                <TableCell>{e.department}</TableCell>
                <TableCell>{e.position}</TableCell>
                <TableCell>{e.hiredAt.slice(0, 10)}</TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[e.status]}`}
                  >
                    {STATUS_LABELS[e.status]}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      e.role === "ADMIN"
                        ? "bg-brand-gradient-soft text-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {ROLE_LABELS[e.role]}
                  </span>
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => setEditing(e)}>
                    編輯
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setResetting(e)}>
                    重設密碼
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {list.data && list.data.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                  尚無員工
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

      {editing !== null && (
        <EmployeeSheet
          editing={editing}
          onClose={() => setEditing(null)}
          onSuccess={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["employees"] });
          }}
        />
      )}

      {resetting && (
        <ResetPasswordDialog employee={resetting} onClose={() => setResetting(null)} />
      )}
    </div>
  );
}

function EmployeeSheet({
  editing,
  onClose,
  onSuccess,
}: {
  editing: EmployeeRow | "new";
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isNew = editing === "new";
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateEmployeeInput>({
    resolver: isNew ? zodResolver(createEmployeeSchema) : undefined,
    defaultValues: isNew
      ? {
          role: "USER",
          status: "ACTIVE",
          department: DEPARTMENTS[0],
          position: POSITIONS[5],
        }
      : {
          employeeNo: (editing as EmployeeRow).employeeNo,
          name: (editing as EmployeeRow).name,
          email: (editing as EmployeeRow).email,
          department: (editing as EmployeeRow).department as (typeof DEPARTMENTS)[number],
          position: (editing as EmployeeRow).position as (typeof POSITIONS)[number],
          // date input 需要 YYYY-MM-DD 字串才能正確回填；提交時由 z.coerce.date() 轉回 Date。
          hiredAt: (editing as EmployeeRow).hiredAt.slice(0, 10) as unknown as Date,
          phone: (editing as EmployeeRow).phone,
          username: (editing as EmployeeRow).username,
          role: (editing as EmployeeRow).role,
          status: (editing as EmployeeRow).status,
        },
  });

  const submit = handleSubmit(async (values) => {
    try {
      if (isNew) {
        await apiClient.post("/employees", values);
        toast.success(`已新增員工 ${values.name}`);
      } else {
        const { initialPassword: _ip, ...rest } = values;
        await apiClient.patch(`/employees/${(editing as EmployeeRow).id}`, rest);
        toast.success(`已更新員工 ${values.name}`);
      }
      onSuccess();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "操作失敗");
    }
  });

  const textFields = [
    { name: "employeeNo", label: "員工編號", type: "text" },
    { name: "name", label: "姓名", type: "text" },
    { name: "email", label: "Email", type: "email" },
    { name: "hiredAt", label: "入職日期", type: "date" },
    { name: "phone", label: "電話", type: "text" },
    { name: "username", label: "帳號", type: "text" },
  ] as const;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isNew ? "新增員工" : `編輯 ${(editing as EmployeeRow).name}`}
          </SheetTitle>
        </SheetHeader>
        <form onSubmit={submit} className="mt-2 grid grid-cols-2 gap-3">
          {textFields.map((f) => (
            <div key={f.name} className="space-y-1.5">
              <Label htmlFor={f.name}>{f.label}</Label>
              <Input id={f.name} type={f.type} {...register(f.name as "name")} />
              {errors[f.name as keyof CreateEmployeeInput] && (
                <p className="text-xs text-destructive">
                  {(errors[f.name as keyof CreateEmployeeInput] as { message?: string })?.message}
                </p>
              )}
            </div>
          ))}

          <EnumField
            control={control}
            name="department"
            label="部門"
            options={DEPARTMENTS}
            error={errors.department?.message}
          />
          <EnumField
            control={control}
            name="position"
            label="職位"
            options={POSITIONS}
            error={errors.position?.message}
          />

          {isNew && (
            <div className="space-y-1.5">
              <Label htmlFor="initialPassword">初始密碼（≥ 8 字元）</Label>
              <Input
                id="initialPassword"
                type="password"
                {...register("initialPassword")}
              />
              {errors.initialPassword && (
                <p className="text-xs text-destructive">{errors.initialPassword.message}</p>
              )}
            </div>
          )}

          <EnumField
            control={control}
            name="role"
            label="角色"
            options={ROLES}
            renderOption={(r) => ROLE_LABELS[r as Role]}
            error={errors.role?.message}
          />
          <EnumField
            control={control}
            name="status"
            label="狀態"
            options={EMPLOYEE_STATUSES}
            renderOption={(s) => STATUS_LABELS[s as EmployeeStatus]}
            error={errors.status?.message}
          />

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

interface EnumFieldProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
  name: "department" | "position" | "role" | "status";
  label: string;
  options: readonly string[];
  renderOption?: (v: string) => string;
  error?: string;
}

function EnumField({ control, name, label, options, renderOption, error }: EnumFieldProps) {
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

function ResetPasswordDialog({
  employee,
  onClose,
}: {
  employee: EmployeeRow;
  onClose: () => void;
}) {
  const reset = useMutation({
    mutationFn: (body: ResetPasswordInput) =>
      apiClient.post(`/employees/${employee.id}/reset-password`, body),
    onSuccess: () => {
      toast.success(`已重設 ${employee.name} 的密碼`);
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "重設失敗");
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重設 {employee.name} 的密碼</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => reset.mutate(values))}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">新密碼（≥ 8 字元）</Label>
            <Input id="newPassword" type="password" {...register("newPassword")} />
            {errors.newPassword && (
              <p className="text-xs text-destructive">{errors.newPassword.message}</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-brand-gradient text-white shadow-glow hover:opacity-95"
            >
              送出
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
