"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Camera, Check, ImagePlus, LoaderCircle, MapPin, Sparkles, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PASIG_BARANGAYS, PASIG_CENTER, isWithinPasigBounds } from "@/lib/pasig";
import type { DuplicateMatch, Severity } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { Button, Card, Input, Select, Textarea, ApiNotice } from "./ui";
import { PKonekMap } from "./pkonek-map";

type SelectedFile = { file: File; preview: string };

export function ComplaintForm() {
  const router = useRouter();
  const categoryResult = useApi(() => api.categories.list(), [], []);
  const [step, setStep] = useState(1);
  const [description, setDescription] = useState("");
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [otherIssue, setOtherIssue] = useState("");
  const [location, setLocation] = useState<{ lat: number; lng: number }>({ ...PASIG_CENTER });
  const [barangay, setBarangay] = useState("");
  const [address, setAddress] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const selectedFilesRef = useRef<SelectedFile[]>([]);
  const [assessment, setAssessment] = useState<{ severity: Severity; score: number } | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { selectedFilesRef.current = selectedFiles; }, [selectedFiles]);
  useEffect(() => () => selectedFilesRef.current.forEach(({ preview }) => URL.revokeObjectURL(preview)), []);

  function chooseFiles(event: React.ChangeEvent<HTMLInputElement>) {
    setError("");
    const remaining = 4 - selectedFiles.length;
    const incoming = Array.from(event.target.files ?? []).slice(0, remaining);
    const invalid = incoming.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024);
    if (invalid) {
      setError("Photos must be JPEG, PNG, or WebP files no larger than 10 MB.");
      event.target.value = "";
      return;
    }
    setSelectedFiles((current) => [...current, ...incoming.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    event.target.value = "";
  }

  function removeFile(index: number) {
    setSelectedFiles((current) => {
      URL.revokeObjectURL(current[index].preview);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  async function askAi() {
    if (description.trim().length < 20) return toast.error("Add a little more detail first.");
    setThinking(true);
    setError("");
    try {
      const result = await api.ai.severity(`${title}. ${description}`);
      setAssessment({ severity: result.severity, score: result.score });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Urgency assessment failed.");
    } finally {
      setThinking(false);
    }
  }

  async function review() {
    if (!isWithinPasigBounds(location.lat, location.lng)) {
      setError("Place the map pin within Pasig City.");
      return;
    }
    setCheckingDuplicates(true);
    setError("");
    try {
      const result = await api.complaints.duplicates({ category_id: categoryId, latitude: location.lat, longitude: location.lng });
      setDuplicates(result.matches);
      setAllowDuplicate(result.matches.length === 0);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check for duplicate reports.");
    } finally {
      setCheckingDuplicates(false);
    }
  }

  async function supportDuplicate(id: string) {
    setBusy(true);
    setError("");
    try {
      await api.complaints.meToo(id);
      toast.success("You were added to this report");
      router.push("/complaints");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not support this report.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!title || !description || !categoryId || !barangay || !address || (isOther && otherIssue.trim().length < 3)) return toast.error("Complete all required details.");
    if (duplicates.length && !allowDuplicate) return setError("Choose an existing report or confirm that this is a separate issue.");
    setBusy(true);
    setError("");
    let complaintId: string | null = null;
    try {
      const created = await api.complaints.create({
        title,
        description: isOther ? `Other issue: ${otherIssue.trim()}\n\n${description}` : description,
        category_id: categoryId,
        latitude: location.lat,
        longitude: location.lng,
        address: `${address}, Barangay ${barangay}, Pasig City`,
        allow_possible_duplicate: allowDuplicate,
      });
      complaintId = created.id;
      for (const selected of selectedFiles) await api.complaints.uploadPhoto(created.id, selected.file, "before");
      toast.success("Report submitted successfully");
      router.push(`/complaints/${created.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not submit the report.";
      if (complaintId) {
        toast.error(`Report created, but a photo upload failed: ${message}`);
        router.push(`/complaints/${complaintId}`);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  const categories = categoryResult.data;
  const selectedCategory = categories.find((category) => category.id === categoryId);
  const isOther = selectedCategory?.name.trim().toLowerCase() === "other";
  return <div className="grid gap-5 xl:grid-cols-[1fr_340px]"><div><div className="mb-6 flex items-center gap-2">{["Describe", "Locate", "Review"].map((label, index) => <div key={label} className="flex flex-1 items-center gap-2"><span className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${step > index ? "bg-teal-700 text-white" : "bg-slate-200 text-slate-500"}`}>{step > index + 1 ? <Check size={15}/> : index + 1}</span><span className={`hidden text-sm font-semibold sm:block ${step > index ? "text-teal-800" : "text-slate-400"}`}>{label}</span>{index < 2 && <div className="h-px flex-1 bg-slate-200"/>}</div>)}</div><ApiNotice error={error || categoryResult.error} retry={categoryResult.error ? categoryResult.reload : undefined}/><Card className="p-5 sm:p-7">
    {step === 1 && <div className="space-y-5"><div><label className="mb-1.5 block text-sm font-bold">What happened? <span className="text-rose-500">*</span></label><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Short, clear issue title" maxLength={200}/></div><div><div className="mb-1.5 flex items-center justify-between"><label className="text-sm font-bold">Describe the issue <span className="text-rose-500">*</span></label><span className="text-xs text-slate-400">{description.length}/5000</span></div><Textarea rows={6} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is wrong? How long has it been happening? Who is affected?" maxLength={5000}/><Button onClick={askAi} type="button" variant="secondary" className="mt-3 border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100" disabled={thinking || description.trim().length < 20}>{thinking ? <LoaderCircle className="animate-spin" size={16}/> : <Sparkles size={16}/>} {thinking ? "Analyzing written report..." : "Analyze written report"}</Button>{assessment && <div className="mt-3 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-white p-4 text-sm text-violet-950"><div className="flex items-center justify-between gap-3"><b className="capitalize">Suggested urgency: {assessment.severity}</b><span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-violet-700 shadow-sm">{Math.round(assessment.score * 100)}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-violet-100"><div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${Math.round(assessment.score * 100)}%` }}/></div><p className="mt-2 text-xs leading-5 text-violet-700">This quick check uses the written report only. Staff can run photo and hotspot analysis after submission.</p></div>}</div><div><label className="mb-1.5 block text-sm font-bold">Category <span className="text-rose-500">*</span></label><Select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); const selected = categories.find((item) => item.id === event.target.value); if (selected?.name.trim().toLowerCase() !== "other") setOtherIssue(""); }} disabled={categoryResult.loading}><option value="">Choose a category</option>{categories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select>{isOther && <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50/60 p-4"><label className="mb-1.5 block text-sm font-bold text-teal-950">What kind of issue is this? <span className="text-rose-500">*</span></label><Textarea value={otherIssue} onChange={(event) => setOtherIssue(event.target.value)} rows={3} minLength={3} maxLength={200} placeholder="Tell us what is happening so the right team can handle it."/><div className="mt-1 text-right text-xs text-teal-700/70">{otherIssue.length}/200</div></div>}</div><div><label className="mb-2 block text-sm font-bold">Photos <span className="font-normal text-slate-400">(up to 4)</span></label><div className="flex flex-wrap gap-3">{selectedFiles.map(({ preview }, index) => <div key={preview} className="relative size-24 overflow-hidden rounded-xl border"><img src={preview} alt={`Upload ${index + 1}`} className="size-full object-cover"/><button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => removeFile(index)} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"><X size={12}/></button></div>)}{selectedFiles.length < 4 && <label className="grid size-24 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-slate-200 text-center text-xs text-slate-500 hover:border-teal-400"><span><ImagePlus className="mx-auto mb-1" size={20}/>Add photo</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={chooseFiles}/></label>}</div></div></div>}
    {step === 2 && <div><h2 className="text-lg font-bold">Pin the exact location</h2><p className="mb-4 mt-1 text-sm text-slate-500">Click the map to move the pin within Pasig City.</p><PKonekMap selected={location} onPick={(lat, lng) => setLocation({ lat, lng })} className="h-[390px]"/><div className="mt-4 grid gap-4 sm:grid-cols-2"><label><span className="mb-1.5 block text-sm font-bold">Barangay <span className="text-rose-500">*</span></span><Select value={barangay} onChange={(event) => setBarangay(event.target.value)}><option value="">Choose a Pasig barangay</option>{PASIG_BARANGAYS.map((name) => <option key={name}>{name}</option>)}</Select></label><label><span className="mb-1.5 block text-sm font-bold">Street or landmark <span className="text-rose-500">*</span></span><Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="e.g. Shaw Blvd., near Capitol Commons" maxLength={450}/></label></div><p className="mt-2 text-xs text-slate-400">Coordinates: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}</p></div>}
    {step === 3 && <div><h2 className="text-lg font-bold">Review your report</h2><p className="mt-1 text-sm text-slate-500">Check the details before sending this to Pasig City.</p>{duplicates.map((duplicate) => <div key={duplicate.id} className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><UsersRound className="shrink-0 text-amber-700"/><div><b className="text-sm text-amber-900">A similar report is {Math.round(duplicate.distance_m)} meters away</b><p className="mt-1 text-sm text-amber-800">{duplicate.title}</p><button disabled={busy} onClick={() => supportDuplicate(duplicate.id)} className="mt-2 text-sm font-bold text-amber-900 underline">This affects me too</button></div></div></div>)}{duplicates.length > 0 && <label className="mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm"><input className="mt-1" type="checkbox" checked={allowDuplicate} onChange={(event) => setAllowDuplicate(event.target.checked)}/><span>This is a separate issue. Submit a new report despite the nearby match.</span></label>}<dl className="mt-5 divide-y rounded-xl border">{[["Issue", title], ["Category", categories.find((category) => category.id === categoryId)?.name], ...(isOther ? [["Other issue", otherIssue]] : []), ["Location", `${address}, Barangay ${barangay}, Pasig City`], ["Coordinates", `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`], ["Photos", `${selectedFiles.length} attached`], ["AI urgency", assessment?.severity ?? "Not assessed"]].map(([key, value]) => <div key={key} className="grid grid-cols-[120px_1fr] gap-3 px-4 py-3 text-sm"><dt className="text-slate-500">{key}</dt><dd className="font-semibold capitalize text-slate-800">{value}</dd></div>)}</dl><div className="mt-5 rounded-xl bg-slate-50 p-4"><b className="text-sm">Description</b><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{description}</p></div></div>}
    <div className="mt-7 flex justify-between border-t pt-5"><Button variant="secondary" disabled={step === 1 || busy} onClick={() => setStep((current) => current - 1)}>Back</Button>{step === 1 ? <Button onClick={() => setStep(2)} disabled={!title || description.length < 5 || !categoryId || (isOther && otherIssue.trim().length < 3)}>Continue</Button> : step === 2 ? <Button onClick={review} disabled={!barangay || !address || checkingDuplicates}>{checkingDuplicates && <LoaderCircle className="animate-spin" size={17}/>} Review</Button> : <Button onClick={submit} disabled={busy || (duplicates.length > 0 && !allowDuplicate)}>{busy ? <LoaderCircle className="animate-spin" size={17}/> : <Camera size={17}/>} Submit report</Button>}</div>
  </Card></div><aside><Card className="sticky top-24 p-5"><div className="flex items-center gap-2 text-teal-800"><Bot size={20}/><b>PKonek reporting guide</b></div><ul className="mt-4 space-y-4 text-sm leading-6 text-slate-500"><li><b className="block text-slate-700">Be specific</b>Describe the hazard, its duration, and who it affects.</li><li><b className="block text-slate-700">Protect privacy</b>Do not include faces, plate numbers, or personal information.</li><li><b className="block text-slate-700">Stay safe</b>Never enter a dangerous area just to capture a photo.</li></ul><div className="mt-5 flex items-start gap-2 rounded-xl bg-teal-50 p-3 text-xs leading-5 text-teal-900"><MapPin size={15} className="mt-0.5 shrink-0"/>Your location is used only to route and map this concern.</div></Card></aside></div>;
}
