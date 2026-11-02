"use client";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "../ui/button";
import { SearchField } from "../ui/list-filters";
import { matchesSearch } from "../../lib/lists/search";
import {
  roomDate,
  roomSelection,
  type RoomsData,
} from "../../lib/operations/rooms";
import type { Options } from "./shared";
function Pager({
  page,
  total,
  onChange,
  label,
}: {
  page: number;
  total: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const pages = Math.max(1, Math.ceil(total / 25));
  return (
    <nav className="actions rooms-pagination" aria-label={"Halaman " + label}>
      <Button
        type="button"
        variant="outline"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Sebelumnya
      </Button>
      <span>
        {page} / {pages} · {total} {label}
      </span>
      <Button
        type="button"
        variant="outline"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        Berikutnya
      </Button>
    </nav>
  );
}
export function RoomLists({
  value,
  staff,
  onOpen,
  disabled,
}: {
  value: RoomsData;
  staff: Options["staff"];
  onOpen: (action: string, id?: string) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState(""),
    [rp, setRp] = useState(1),
    [sp, setSp] = useState(1),
    [ap, setAp] = useState(1);
  const roomName = (id: string) =>
    value.rooms.find((r) => r.id === id)?.name || "Ruang tidak tersedia";
  const sessionName = (id: string | null) =>
    value.sessions.find((s) => s.id === id)?.name || "Sesi utama lama";
  const staffName = (id: string | null) =>
    staff.find((s) => s.id === id)?.name ||
    id ||
    "Di luar periode sesi / tidak aktif";
  const rooms = value.rooms.filter((r) => matchesSearch(r.name, search)),
    sessions = value.sessions.filter((s) => matchesSearch(s.name, search)),
    assignments = value.assignments.filter((a) =>
      matchesSearch(
        roomName(a.room_id) +
          " " +
          sessionName(a.session_id) +
          " " +
          staffName(a.original_supervisor_id) +
          " " +
          staffName(a.effective_supervisor),
        search,
      ),
    );
  const clamp = (p: number, total: number) =>
      Math.min(p, Math.max(1, Math.ceil(total / 25))),
    rpage = clamp(rp, rooms.length),
    spage = clamp(sp, sessions.length),
    apage = clamp(ap, assignments.length);
  useEffect(() => {
    setRp((p) => clamp(p, rooms.length));
    setSp((p) => clamp(p, sessions.length));
    setAp((p) => clamp(p, assignments.length));
  }, [rooms.length, sessions.length, assignments.length]);
  return (
    <div className="stack rooms-overview">
      <div className="rooms-summary" aria-label="Ringkasan pengaturan">
        <span>
          <strong>{value.rooms.length}</strong> ruang
        </span>
        <span>
          <strong>{value.roster.length}</strong> peserta ditempatkan
        </span>
        <span>
          <strong>{value.sessions.length}</strong> sesi
        </span>
        <span>
          <strong>{value.assignments.filter((a) => a.active).length}</strong>{" "}
          tugas aktif
        </span>
      </div>
      <div className="actions">
        <Button
          type="button"
          disabled={disabled}
          onClick={() => onOpen("room_save")}
        >
          Tambah ruang
        </Button>
        <Button
          type="button"
          disabled={disabled}
          onClick={() => onOpen("session_save")}
        >
          Tambah sesi
        </Button>
        <Button
          type="button"
          disabled={
            disabled ||
            !value.rooms.length ||
            !value.sessions.length ||
            !staff.length
          }
          onClick={() => onOpen("assign")}
        >
          Tugaskan pengawas
        </Button>
      </div>
      {!staff.length && (
        <p>Belum ada Guru/Pengawas aktif yang dapat ditugaskan.</p>
      )}
      <SearchField
        label="Cari ruang, sesi atau pengawas"
        value={search}
        maxLength={150}
        onChange={(v) => {
          setSearch(v);
          setRp(1);
          setSp(1);
          setAp(1);
        }}
      />
      <section className="stack" aria-label="Daftar ruang">
        <h2>Ruang</h2>
        <div
          className="table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Daftar ruang; geser untuk melihat tindakan"
        >
          <table>
            <thead>
              <tr>
                <th>Ruang</th>
                <th>Kapasitas</th>
                <th>Peserta</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {rooms.slice((rpage - 1) * 25, rpage * 25).map((r) => {
                const pinned =
                  value.assignments.some((a) => a.room_id === r.id) ||
                  r.count > 0;
                return (
                  <tr key={r.id}>
                    <th scope="row">{r.name}</th>
                    <td>{r.capacity === 0 ? "Tanpa batas" : r.capacity}</td>
                    <td>{r.count}</td>
                    <td>
                      <div className="actions">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={disabled}
                          onClick={() => onOpen("room_save", r.id)}
                        >
                          Ubah
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={disabled}
                          onClick={() => onOpen("roster_add", r.id)}
                        >
                          Tambah peserta
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={disabled || !r.count}
                          onClick={() => onOpen("roster_remove", r.id)}
                        >
                          Keluarkan peserta
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={disabled || pinned}
                          onClick={() => onOpen("room_delete", r.id)}
                        >
                          Hapus
                        </Button>
                      </div>
                      {pinned && (
                        <small>
                          Ruang dengan peserta atau riwayat penugasan tidak
                          dapat dihapus.
                        </small>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rooms.length && (
          <p>
            {search
              ? "Tidak ada ruang yang cocok."
              : "Belum ada ruang. Tambahkan ruang sebelum menempatkan peserta."}
          </p>
        )}
        <Pager
          page={rpage}
          total={rooms.length}
          onChange={setRp}
          label="ruang"
        />
      </section>
      <section className="stack" aria-label="Daftar sesi">
        <h2>Sesi</h2>
        <p className="muted">
          Jadwal ditampilkan dan diisi dalam WIB. Sesi harus berada dalam jadwal
          ujian.
        </p>
        <div className="rooms-sessions" tabIndex={0} role="region" aria-label="Kartu sesi; gulir untuk melihat jadwal lainnya">
          {sessions.slice((spage - 1) * 25, spage * 25).map((s) => {
            const pinned = value.assignments.some((a) => a.session_id === s.id);
            return (
              <article className="panel stack" key={s.id}>
                <h3>{s.name}</h3>
                <p>
                  {roomDate(s.starts_at)} – {roomDate(s.ends_at)}
                </p>
                <div className="actions">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => onOpen("session_save", s.id)}
                  >
                    Ubah
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled || pinned}
                    onClick={() => onOpen("session_delete", s.id)}
                  >
                    Hapus
                  </Button>
                </div>
                {pinned && (
                  <small>
                    Sesi dirujuk penugasan; riwayat tetap dipertahankan.
                  </small>
                )}
              </article>
            );
          })}
        </div>
        {!sessions.length && (
          <p>
            {search
              ? "Tidak ada sesi yang cocok."
              : "Belum ada sesi. Tambahkan jadwal sesi ujian."}
          </p>
        )}
        <Pager
          page={spage}
          total={sessions.length}
          onChange={setSp}
          label="sesi"
        />
      </section>
      <section className="stack" aria-label="Daftar penugasan">
        <h2>Penugasan pengawas</h2>
        <div
          className="table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Daftar penugasan; geser untuk melihat tindakan"
        >
          <table>
            <thead>
              <tr>
                <th>Ruang / sesi</th>
                <th>Pengawas asal</th>
                <th>Efektif saat ini</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {assignments.slice((apage - 1) * 25, apage * 25).map((a) => (
                <tr key={a.id}>
                  <th scope="row">
                    {roomName(a.room_id)}
                    <small>{sessionName(a.session_id)}</small>
                  </th>
                  <td>
                    {staffName(a.original_supervisor_id)}
                    <small>{a.active ? "Aktif" : "Dinonaktifkan"}</small>
                  </td>
                  <td>
                    {staffName(a.effective_supervisor)}
                    {a.substitutions
                      .filter((s) => !s.revoked_at)
                      .map((s) => (
                        <p key={s.id}>
                          Periode pengganti: {roomDate(s.effective_from)} –{" "}
                          {s.effective_until
                            ? roomDate(s.effective_until)
                            : "Tanpa akhir"}
                        </p>
                      ))}
                  </td>
                  <td>
                    <div className="actions">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          disabled ||
                          !a.active ||
                          !staff.some((s) => s.id !== a.original_supervisor_id)
                        }
                        onClick={() => onOpen("substitute", a.id)}
                      >
                        Tunjuk pengganti
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          disabled ||
                          !a.substitutions.some((s) => !s.revoked_at)
                        }
                        onClick={() => onOpen("revoke", a.id)}
                      >
                        Cabut pengganti
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={disabled || !a.active}
                        onClick={() => onOpen("unassign", a.id)}
                      >
                        Nonaktifkan tugas
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!assignments.length && (
          <p>
            {search
              ? "Tidak ada penugasan yang cocok."
              : "Belum ada penugasan pengawas."}
          </p>
        )}
        <Pager
          page={apage}
          total={assignments.length}
          onChange={setAp}
          label="penugasan"
        />
      </section>
    </div>
  );
}
export function RosterChoices({
  choices,
  selected,
  onChange,
}: {
  choices: { id: string; name: string }[];
  selected: string[];
  onChange: Dispatch<SetStateAction<string[]>>;
}) {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    shown = choices.filter((p) => matchesSearch(p.name, search)),
    current = Math.min(page, Math.max(1, Math.ceil(shown.length / 25)));
  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(1, Math.ceil(shown.length / 25))));
  }, [shown.length]);
  return (
    <fieldset className="stack rooms-roster">
      <legend>Pilih peserta · maksimal 500</legend>
      <SearchField
        label="Cari peserta"
        value={search}
        maxLength={150}
        onChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
      />
      <div className="actions">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onChange((prev) =>
              roomSelection(
                prev,
                shown.map((p) => p.id),
              ),
            )
          }
          disabled={!shown.length || selected.length >= 500}
        >
          Pilih hasil · maks. 500
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange([])}
          disabled={!selected.length}
        >
          Kosongkan pilihan
        </Button>
      </div>
      <p role="status">
        {selected.length} / 500 dipilih · {shown.length} hasil. Pilihan
        dipertahankan antarhalaman dan pencarian.
      </p>
      <div className="ops-choice-list">
        {shown.slice((current - 1) * 25, current * 25).map((p) => (
          <label key={p.id}>
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              disabled={!selected.includes(p.id) && selected.length >= 500}
              onChange={(e) => {
                const checked = e.target.checked;
                onChange((prev) =>
                  checked
                    ? roomSelection(prev, [p.id])
                    : prev.filter((id) => id !== p.id),
                );
              }}
            />
            <span>{p.name}</span>
          </label>
        ))}
      </div>
      {!shown.length && (
        <p>
          {search
            ? "Tidak ada peserta yang cocok."
            : "Tidak ada peserta yang dapat dipilih."}
        </p>
      )}
      <Pager
        page={current}
        total={shown.length}
        onChange={setPage}
        label="peserta"
      />
    </fieldset>
  );
}
