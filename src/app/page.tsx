
"use client";

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  scanFoodImage, 
  type ScanFoodImageInput, 
  type ScanFoodImageOutput 
} from '@/ai/flows/food-image-analyzer';
import { auth, db, serverTimestamp } from '@/lib/firebase'; 
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, orderBy, Timestamp as FirestoreTimestamp, doc, deleteDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';


// ShadCN UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from '@/components/ui/skeleton';


// Lucide Icons
import { UploadCloud, Brain, Utensils, AlertCircle, CheckCircle, Info, UserCircle, LogIn, UserPlus, LogOut, ListChecks, Loader2, Heart, ChefHat, Settings, MessageSquareWarning } from 'lucide-react';

const UNIDENTIFIED_FOOD_MESSAGE = "ไม่สามารถระบุชนิดอาหารได้";
const GENERIC_NUTRITION_UNAVAILABLE = "ไม่สามารถระบุข้อมูลทางโภชนาการได้";
const GENERIC_SAFETY_UNAVAILABLE = "ไม่มีคำแนะนำด้านความปลอดภัยเฉพาะสำหรับรายการนี้";
const LOCAL_STORAGE_LIKED_MEALS_KEY = 'fsfa-likedMealNames';

// Define PageSection outside of FSFAPage component
const PageSection: React.FC<{title: string; icon: React.ReactNode; children: React.ReactNode; id: string; className?: string; titleBgColor?: string; titleTextColor?: string;}> = ({ title, icon, children, id, className, titleBgColor = "bg-primary", titleTextColor = "text-primary-foreground" }) => (
  <section id={id} className={`py-12 ${className || ''}`}>
    <div className="container mx-auto px-4">
      <h2 className={`text-4xl font-headline font-semibold text-center mb-10 ${titleTextColor} ${titleBgColor} py-3 rounded-lg shadow-md`}>
        {React.cloneElement(icon as React.ReactElement, { className: "inline-block w-10 h-10 mr-3" })}
        {title}
      </h2>
      {children}
    </div>
  </section>
);
PageSection.displayName = 'PageSection';

interface LikedMealItem {
  name: string;
  id?: string; // Firestore document ID, undefined for localStorage items
  likedAt?: FirestoreTimestamp | Date; // For sorting, mainly from Firestore
}

export default function FSFAPage() {
  const { toast } = useToast();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageAnalysisResult, setImageAnalysisResult] = useState<ScanFoodImageOutput | null>(null);
  const [isLoadingImageAnalysis, setIsLoadingImageAnalysis] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  
  // State for the new like system
  const [isLiking, setIsLiking] = useState(false); // Loading state for the like button action
  const [isCurrentFoodLiked, setIsCurrentFoodLiked] = useState(false); // Is the food currently shown in analysis results liked?
  
  // State for "My Meals" Dialog
  const [isMyMealsDialogOpen, setIsMyMealsDialogOpen] = useState(false);
  const [likedMealsList, setLikedMealsList] = useState<LikedMealItem[]>([]); // Stores {name: string, id?: string}
  const [isLoadingMyMeals, setIsLoadingMyMeals] = useState(false);

  const isFoodIdentified = imageAnalysisResult && imageAnalysisResult.foodItem !== UNIDENTIFIED_FOOD_MESSAGE;

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        // When user logs out, or initially no user, reset relevant states
        // Liked meals will be re-fetched for anonymous (localStorage) or new user
      }
      // Resetting image-specific states when auth changes might be too aggressive
      // Consider if image analysis should persist across login/logout
      // For now, we'll let loadLikedMealNames handle fetching appropriate data
    });
    return () => unsubscribeAuth(); 
  }, []);
  
  // Effect to load liked meal names from Firestore (if logged in) or localStorage (if not)
  useEffect(() => {
    const loadUserLikedMealNames = async () => {
      console.log(`[My Meals Effect] Loading liked meal names. User: ${currentUser?.uid || 'Anonymous'}`);
      setIsLoadingMyMeals(true);
      let fetchedMealItems: LikedMealItem[] = [];
  
      if (currentUser?.uid) { // Logged-in user: Fetch from Firestore
        try {
          const likedMealNamesRef = collection(db, `users/${currentUser.uid}/likedMealNames`);
          const q = query(likedMealNamesRef, orderBy('likedAt', 'desc'));
          const querySnapshot = await getDocs(q);
          fetchedMealItems = querySnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().foodName as string,
            likedAt: doc.data().likedAt, // Keep for potential future sorting/display logic
          }));
          console.log('[My Meals Effect] Fetched from Firestore:', fetchedMealItems);
        } catch (error) {
          console.error("[My Meals Effect] Error fetching liked meal names from Firestore:", error);
          toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถโหลดรายการที่ถูกใจจากระบบคลาวด์ได้", variant: "destructive" });
        }
      } else { // Not logged in: Fetch from localStorage
        const localData = localStorage.getItem(LOCAL_STORAGE_LIKED_MEALS_KEY);
        if (localData) {
          try {
            const names: string[] = JSON.parse(localData);
            fetchedMealItems = names.map(name => ({ name })).sort((a, b) => a.name.localeCompare(b.name)); // Simple alpha sort for local
            console.log('[My Meals Effect] Fetched from localStorage:', fetchedMealItems);
          } catch (e) {
            console.error("[My Meals Effect] Error parsing liked meal names from localStorage:", e);
            localStorage.removeItem(LOCAL_STORAGE_LIKED_MEALS_KEY); // Clear corrupted data
            toast({ title: "ข้อมูลที่ถูกใจเสียหาย", description: "ข้อมูลที่ถูกใจในเครื่องถูกล้าง โปรดลองใหม่อีกครั้ง", variant: "destructive" });
          }
        } else {
           console.log('[My Meals Effect] No data in localStorage.');
        }
      }
      setLikedMealsList(fetchedMealItems);
      setIsLoadingMyMeals(false);
      console.log('[My Meals Effect] Finished loading. likedMealsList state updated.');
    };
  
    loadUserLikedMealNames();
  }, [currentUser, toast]); // Re-fetch when user logs in/out

  // Effect to determine if the *currently displayed* food item in analysis results is liked
  useEffect(() => {
    if (imageAnalysisResult?.foodItem && imageAnalysisResult.foodItem !== UNIDENTIFIED_FOOD_MESSAGE) {
      const currentFoodName = imageAnalysisResult.foodItem;
      const isLiked = likedMealsList.some(meal => meal.name === currentFoodName);
      setIsCurrentFoodLiked(isLiked);
      console.log(`[Like Status Effect] Food: "${currentFoodName}", Is Liked: ${isLiked}, Based on likedMealsList of length: ${likedMealsList.length}`);
    } else {
      setIsCurrentFoodLiked(false); // No valid food item to check or no analysis result
      console.log(`[Like Status Effect] No valid food item or analysis result. isCurrentFoodLiked set to false.`);
    }
  }, [imageAnalysisResult, likedMealsList]);


  const formatDate = (timestamp: FirestoreTimestamp | Date | undefined) => {
    if (!timestamp) return 'ไม่ระบุวันที่';
    const date = timestamp instanceof FirestoreTimestamp ? timestamp.toDate() : timestamp;
    try {
      return format(date, "d MMM yy", { locale: th }); // Shorter format for dialog
    } catch (error) {
      console.error("Error formatting date:", error, timestamp);
      return 'วันที่ไม่ถูกต้อง';
    }
  };
  
  const handleLogout = async () => {
    try {
      await signOut(auth);
      setLikedMealsList([]); // Clear liked meals from state on logout
      setIsCurrentFoodLiked(false); // Reset like status of current food item
      toast({
        title: "ออกจากระบบสำเร็จ",
      });
      // The useEffect for loadUserLikedMealNames will re-run due to currentUser change,
      // and will load from localStorage if applicable.
    } catch (error: unknown) {
      console.error("Logout error:", error);
      toast({
        title: "เกิดข้อผิดพลาดในการออกจากระบบ",
        variant: "destructive",
      });
    }
  };

  const resetImageRelatedStates = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setImageAnalysisResult(null);
    setImageError(null);
    setIsCurrentFoodLiked(false); // Reset like status for the new image context
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      resetImageRelatedStates(); // Reset before setting new file
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageAnalysis = async () => {
    if (!selectedFile) {
      setImageError('โปรดเลือกไฟล์รูปภาพก่อน');
      return;
    }
    setIsLoadingImageAnalysis(true);
    setImageError(null);
    setIsCurrentFoodLiked(false); // Ensure reset before new analysis potentially updates it
    
    const reader = new FileReader();
    reader.readAsDataURL(selectedFile);
    reader.onload = async () => {
      const foodImage = reader.result as string;
      try {
        const result = await scanFoodImage({ foodImage } as ScanFoodImageInput);
        setImageAnalysisResult(result); // This will trigger the useEffect to check if the new food is liked
        
        const identified = result.foodItem !== UNIDENTIFIED_FOOD_MESSAGE;
        if (identified) {
          toast({
            title: "การวิเคราะห์เสร็จสมบูรณ์",
            description: `ระบุได้ว่าเป็น: ${result.foodItem}`,
          });
        } else {
          toast({
            title: "หมายเหตุการวิเคราะห์",
            description: "ไม่สามารถระบุรายการอาหารจากภาพที่ให้มาได้ โปรดลองภาพอื่น",
            variant: "default"
          });
        }
      } catch (error: unknown) {
        console.error('Error analyzing image:', error);
        let errorMessage = 'วิเคราะห์รูปภาพไม่สำเร็จ โปรดลองอีกครั้ง';
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        setImageError(errorMessage);
        setImageAnalysisResult(null); // Clear results on error
        toast({
          title: "เกิดข้อผิดพลาดในการวิเคราะห์",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        setIsLoadingImageAnalysis(false);
      }
    };
    reader.onerror = () => {
      setImageError('ไม่สามารถอ่านไฟล์รูปภาพที่เลือก');
      setIsLoadingImageAnalysis(false);
      setImageAnalysisResult(null); 
       toast({
          title: "ข้อผิดพลาดในการอ่านไฟล์",
          description: "ไม่สามารถอ่านไฟล์รูปภาพที่เลือก",
          variant: "destructive",
        });
    };
  };

  const handleToggleLike = async (foodNameToToggle: string | null | undefined) => {
    if (!foodNameToToggle || foodNameToToggle === UNIDENTIFIED_FOOD_MESSAGE) {
      toast({ title: "ไม่สามารถถูกใจได้", description: "ไม่สามารถระบุชื่ออาหารได้", variant: "destructive" });
      return;
    }
    console.log(`[Toggle Like] Attempting to toggle like for: "${foodNameToToggle}"`);
    setIsLiking(true);

    const alreadyLiked = likedMealsList.some(meal => meal.name === foodNameToToggle);
    console.log(`[Toggle Like] Before action, food "${foodNameToToggle}" is ${alreadyLiked ? 'LIKED' : 'NOT LIKED'} in current state.`);

    if (currentUser?.uid) { // Logged-in user: Use Firestore
      const likedMealNamesRef = collection(db, 'users', currentUser.uid, 'likedMealNames');
      if (alreadyLiked) { // User wants to UNLIKE
        try {
          const q = query(likedMealNamesRef, where("foodName", "==", foodNameToToggle));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            const docIdToDelete = querySnapshot.docs[0].id;
            await deleteDoc(doc(db, 'users', currentUser.uid, 'likedMealNames', docIdToDelete));
            setLikedMealsList(prev => prev.filter(meal => meal.name !== foodNameToToggle));
            setIsCurrentFoodLiked(false);
            toast({ description: `"${foodNameToToggle}" ถูกนำออกจากรายการที่ถูกใจแล้ว` });
            console.log(`[Toggle Like - Firestore] UNLIKED and removed: "${foodNameToToggle}"`);
          } else {
            console.warn(`[Toggle Like - Firestore] Tried to unlike "${foodNameToToggle}", but not found in DB. State might be inconsistent.`);
            // Force refresh local state from DB if this happens
             await loadUserLikedMealNames(); // Defined elsewhere, re-fetches and sets likedMealsList
          }
        } catch (error) {
          console.error("[Toggle Like - Firestore] Error unliking meal:", error);
          toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถยกเลิกการถูกใจได้", variant: "destructive" });
        }
      } else { // User wants to LIKE
        try {
          const newDocRef = await addDoc(likedMealNamesRef, { foodName: foodNameToToggle, likedAt: serverTimestamp() });
          setLikedMealsList(prev => [...prev, { name: foodNameToToggle, id: newDocRef.id, likedAt: new Date() }].sort((a,b) => (b.likedAt as Date).getTime() - (a.likedAt as Date).getTime()));
          setIsCurrentFoodLiked(true);
          toast({ description: `ถูกใจ "${foodNameToToggle}" แล้ว!`});
          console.log(`[Toggle Like - Firestore] LIKED and added: "${foodNameToToggle}"`);
        } catch (error) {
          console.error("[Toggle Like - Firestore] Error liking meal:", error);
          toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถถูกใจได้", variant: "destructive" });
        }
      }
    } else { // Not logged in: Use localStorage
      let currentLocalLikedNames: string[] = [];
      const storedNamesJson = localStorage.getItem(LOCAL_STORAGE_LIKED_MEALS_KEY);
      if (storedNamesJson) {
        try {
          currentLocalLikedNames = JSON.parse(storedNamesJson);
        } catch (e) { console.error("Error parsing localStorage for likes", e); currentLocalLikedNames = [];}
      }

      if (alreadyLiked) { // User wants to UNLIKE
        currentLocalLikedNames = currentLocalLikedNames.filter(name => name !== foodNameToToggle);
        setIsCurrentFoodLiked(false);
        toast({ description: `"${foodNameToToggle}" ถูกนำออกจากรายการที่ถูกใจแล้ว` });
        console.log(`[Toggle Like - localStorage] UNLIKED and removed: "${foodNameToToggle}"`);
      } else { // User wants to LIKE
        currentLocalLikedNames.push(foodNameToToggle);
        setIsCurrentFoodLiked(true);
        toast({ description: `ถูกใจ "${foodNameToToggle}" แล้ว!` });
        console.log(`[Toggle Like - localStorage] LIKED and added: "${foodNameToToggle}"`);
      }
      localStorage.setItem(LOCAL_STORAGE_LIKED_MEALS_KEY, JSON.stringify(currentLocalLikedNames));
      setLikedMealsList(currentLocalLikedNames.map(name => ({ name })).sort((a,b) => a.name.localeCompare(b.name)));
    }
    setIsLiking(false);
    console.log(`[Toggle Like] Action complete for: "${foodNameToToggle}". Current isCurrentFoodLiked: ${!alreadyLiked}`);
  };
  
  // Function to load liked meal names, used by useEffect and potentially by other actions
  const loadUserLikedMealNames = async () => {
    console.log(`[loadUserLikedMealNames Func] Loading. User: ${currentUser?.uid || 'Anonymous'}`);
    setIsLoadingMyMeals(true);
    let fetchedMealItems: LikedMealItem[] = [];

    if (currentUser?.uid) {
      try {
        const likedMealNamesRef = collection(db, `users/${currentUser.uid}/likedMealNames`);
        const q = query(likedMealNamesRef, orderBy('likedAt', 'desc'));
        const querySnapshot = await getDocs(q);
        fetchedMealItems = querySnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().foodName as string,
          likedAt: doc.data().likedAt,
        }));
      } catch (error) {
        console.error("[loadUserLikedMealNames Func] Error fetching from Firestore:", error);
        toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถโหลดรายการที่ถูกใจจากระบบคลาวด์ได้", variant: "destructive" });
      }
    } else {
      const localData = localStorage.getItem(LOCAL_STORAGE_LIKED_MEALS_KEY);
      if (localData) {
        try {
          const names: string[] = JSON.parse(localData);
          fetchedMealItems = names.map(name => ({ name })).sort((a, b) => a.name.localeCompare(b.name));
        } catch (e) {
          console.error("[loadUserLikedMealNames Func] Error parsing from localStorage:", e);
          localStorage.removeItem(LOCAL_STORAGE_LIKED_MEALS_KEY);
        }
      }
    }
    setLikedMealsList(fetchedMealItems);
    setIsLoadingMyMeals(false);
    console.log(`[loadUserLikedMealNames Func] Finished. Fetched ${fetchedMealItems.length} items.`);
  };


  return (
    <div className="min-h-screen bg-background text-foreground font-body p-4 md:p-8">
      <header className="py-8 text-center bg-gradient-to-r from-primary/10 via-secondary/20 to-primary/10 rounded-lg shadow-md mb-12">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div className="flex-1 text-left md:text-center">
             <Link href="/" className="inline-block">
              <h1 className="text-4xl md:text-5xl font-headline font-bold text-primary flex items-center justify-start md:justify-center">
                <Utensils className="w-10 h-10 md:w-12 md:h-12 mr-2 md:mr-4" />
                FSFA <span className="text-2xl md:text-3xl font-normal ml-2 text-foreground/90">(Food Security For All 🍉🥗)</span>
              </h1>
            </Link>
            <p className="mt-1 md:mt-2 text-lg md:text-xl text-foreground/80 font-body text-left md:text-center">
              สร้างความมั่นคงทางอาหารและสุขภาวะทางโภชนาการที่ดีสำหรับทุกคน
            </p>
          </div>
          <div className="flex items-center space-x-2 md:space-x-3 ml-4">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full w-11 h-11 md:w-12 md:h-12"
              onClick={() => {
                loadUserLikedMealNames(); // Ensure data is fresh when opening
                setIsMyMealsDialogOpen(true);
              }}
              aria-label="มื้ออาหารของฉัน"
            >
              <ListChecks className="w-6 h-6 md:w-7 md:h-7 text-primary" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full w-11 h-11 md:w-12 md:h-12">
                  <UserCircle className="w-7 h-7 md:w-8 md:h-8 text-primary" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>บัญชีของฉัน</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {currentUser ? (
                  <>
                    <DropdownMenuItem disabled>
                      <span className="truncate">{currentUser.email}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>ออกจากระบบ</span>
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/login" className="flex items-center w-full cursor-pointer">
                        <LogIn className="mr-2 h-4 w-4" />
                        <span>เข้าสู่ระบบ</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/register" className="flex items-center w-full cursor-pointer">
                        <UserPlus className="mr-2 h-4 w-4" />
                        <span>ลงทะเบียน</span>
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 space-y-10 md:space-y-16">

        <PageSection title="อาหารอะไรที่อยู่บนจานของคุณ? 🤔🍽️" icon={<Brain />} id="image-scanner" className="bg-secondary/30 rounded-lg shadow-md" titleBgColor="bg-primary" titleTextColor="text-primary-foreground">
          <Card className="max-w-2xl mx-auto shadow-lg rounded-lg overflow-hidden bg-card">
            <CardHeader>
              <CardTitle className="text-2xl font-headline text-primary">AI วิเคราะห์อาหาร 🤖🥕</CardTitle>
              <CardDescription className="text-md font-body">อัปโหลดรูปภาพอาหาร แล้ว AI ของเราจะให้ข้อมูลทางโภชนาการและคำแนะนำด้านความปลอดภัย</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="food-image-upload" className="text-lg font-body text-foreground">อัปโหลดรูปภาพอาหาร</Label>
                <Input id="food-image-upload" type="file" accept="image/*" onChange={handleFileChange} className="mt-2 file:text-accent file:font-semibold file:mr-2 file:px-3 file:py-1 file:rounded-full file:border-0 file:bg-accent/20 hover:file:bg-accent/30 text-lg p-2" />
              </div>
              
              {previewUrl && (
                <div className="mt-6 mb-6 flex flex-col items-center space-y-4 md:items-start md:justify-center md:space-y-0 md:space-x-8 border border-dashed border-border p-6 rounded-lg bg-card shadow-sm">
                  <div className="flex-shrink-0 text-center">
                    <p className="text-sm font-body mb-2 text-muted-foreground">ตัวอย่างรูปภาพ:</p>
                    <Image src={previewUrl} alt="Food preview" width={240} height={240} className="rounded-lg shadow-md object-contain max-h-56 mx-auto" data-ai-hint="food meal" />
                  </div>
                </div>
              )}

              {imageError && <p className="text-destructive text-sm font-body flex items-center"><AlertCircle className="w-4 h-4 mr-1" />{imageError}</p>}

              <Button onClick={handleImageAnalysis} disabled={isLoadingImageAnalysis || !selectedFile} className="w-full text-lg py-6" size="lg">
                {isLoadingImageAnalysis ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5" />
                    กำลังวิเคราะห์...
                  </>
                ) : (
                  <> <UploadCloud className="mr-2 h-6 w-6" /> วิเคราะห์รูปภาพ </>
                )}
              </Button>

              {imageAnalysisResult && (
                <Card className="mt-8 shadow-md rounded-lg overflow-hidden bg-card border border-primary/30">
                  <CardHeader className="pb-2 bg-primary/10">
                      <CardTitle className="text-xl font-headline text-primary flex items-center">
                      {isFoodIdentified ? <CheckCircle className="w-6 h-6 mr-2 text-green-500" /> : <Info className="w-6 h-6 mr-2 text-yellow-500" />}
                      ผลการวิเคราะห์
                      </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 md:p-6 space-y-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-lg font-body text-foreground">
                          {imageAnalysisResult.foodItem === UNIDENTIFIED_FOOD_MESSAGE ? "อาหารที่ระบุได้:" : "อาหารที่ระบุได้:"}
                        </h4>
                        {isFoodIdentified && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleLike(imageAnalysisResult?.foodItem)}
                            disabled={isLiking}
                            className="rounded-full text-pink-500 hover:bg-pink-500/10 data-[state=liked]:text-pink-600 data-[state=liked]:bg-pink-500/20"
                            data-state={isCurrentFoodLiked ? 'liked' : 'unliked'}
                            aria-label={isCurrentFoodLiked ? 'ยกเลิกการถูกใจ' : 'ถูกใจ'}
                          >
                            {isLiking ? (
                              <Loader2 className="h-6 w-6 animate-spin" />
                            ) : (
                              <Heart className={`h-6 w-6 transition-colors ${isCurrentFoodLiked ? 'fill-current' : ''}`} />
                            )}
                          </Button>
                        )}
                      </div>
                      <p className="text-md font-body text-foreground/80">
                        {imageAnalysisResult.foodItem === UNIDENTIFIED_FOOD_MESSAGE 
                           ? "ขออภัยค่ะ ไม่สามารถระบุรายการอาหารในภาพได้ชัดเจน โปรดลองภาพอื่นที่มีแสงสว่างเพียงพอ หรือลองเปลี่ยนมุมถ่ายภาพนะคะ"
                           : imageAnalysisResult.foodItem
                        }
                      </p>
                    </div>
                    
                    {isFoodIdentified && imageAnalysisResult.nutritionalInformation !== GENERIC_NUTRITION_UNAVAILABLE && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-semibold text-lg font-body text-foreground">ข้อมูลทางโภชนาการ:</h4>
                          <ScrollArea className="max-h-40 pr-2">
                              <p className="text-md font-body text-foreground/80 whitespace-pre-wrap">{imageAnalysisResult.nutritionalInformation}</p>
                          </ScrollArea>
                        </div>
                      </>
                    )}
                    {isFoodIdentified && (imageAnalysisResult.safetyPrecautions && imageAnalysisResult.safetyPrecautions.some(p => p !== GENERIC_SAFETY_UNAVAILABLE)) && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-semibold text-lg font-body text-foreground flex items-center">
                            <MessageSquareWarning className="w-5 h-5 mr-2 text-orange-500"/>คำแนะนำด้านความปลอดภัย:
                          </h4>
                          <ScrollArea className="max-h-40 mt-2 pr-2">
                              <ul className="list-disc pl-5 space-y-1 text-md font-body text-foreground/80">
                                {imageAnalysisResult.safetyPrecautions.map((precaution, index) => (
                                  precaution !== GENERIC_SAFETY_UNAVAILABLE ? <li key={index}>{precaution}</li> : null
                                )).filter(Boolean)}
                              </ul>
                          </ScrollArea>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </PageSection>

      </main>

      {/* My Meals Dialog - Shows only names now */}
      <Dialog open={isMyMealsDialogOpen} onOpenChange={setIsMyMealsDialogOpen}>
        <DialogContent className="max-w-md min-h-[50vh] flex flex-col sm:max-w-md"> 
          <DialogHeader>
            <DialogTitle className="text-2xl font-headline text-primary flex items-center">
              <ListChecks className="w-7 h-7 mr-2" />
              มื้ออาหารของฉัน
            </DialogTitle>
            <DialogDescription>
              รายการชื่ออาหารที่คุณกดถูกใจไว้
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-hidden py-4">
            <ScrollArea className="h-full pr-4"> 
              {isLoadingMyMeals ? (
                <div className="space-y-3 p-1">
                  {[...Array(5)].map((_, index) => ( 
                    <Skeleton key={index} className="h-8 w-full rounded-md" />
                  ))}
                </div>
              ) : likedMealsList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-6">
                  <Info className="w-12 h-12 text-primary mb-3" /> 
                  <p className="text-lg font-semibold text-foreground">ยังไม่มีมื้ออาหารที่ถูกใจ</p>
                  <p className="text-sm text-muted-foreground">
                    เมื่อคุณกดถูกใจมื้ออาหารที่สแกนแล้ว ชื่ออาหารจะแสดงที่นี่ค่ะ
                  </p>
                  <Button onClick={() => setIsMyMealsDialogOpen(false)} className="mt-4 text-sm" size="sm">
                    <Utensils className="mr-2 h-4 w-4" /> ไปสแกนอาหาร
                  </Button>
                </div>
              ) : (
                <ul className="space-y-2 p-1">
                  {likedMealsList.map((meal, index) => (
                    <li key={meal.id || `${meal.name}-${index}`} className="p-3 bg-card border rounded-lg shadow-sm text-foreground font-body text-md">
                      {meal.name}
                      {/* Optionally, if you want to show likedAt for Firestore items:
                      {currentUser && meal.likedAt && (
                        <span className="text-xs text-muted-foreground ml-2">({formatDate(meal.likedAt)})</span>
                      )}
                      */}
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>
          <DialogFooter className="mt-auto pt-4 border-t">
            <Button variant="outline" onClick={() => setIsMyMealsDialogOpen(false)}>
              ปิด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <footer className="text-center py-8 mt-12 md:mt-16 border-t border-border/50">
        <p className="text-muted-foreground font-body">&copy; {new Date().getFullYear()} FSFA (Food Security For All) สงวนลิขสิทธิ์</p>
      </footer>
    </div>
  );
}
    
