export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "student";
  profileImg?: string;
  isBlocked?: boolean;
  enrolledCourseIds?: string[];
}

export interface Lesson {
  id: string;
  title: string;
  duration: string;
  videoUrl: string;
  isPreview: boolean;
  description?: string;
  pdfUrl?: string;
  pdfTitle?: string;
  order?: number;
}

export interface Resource {
  title: string;
  type: "pdf" | "link" | "zip";
  url: string;
  size?: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  category: string;
  instructor: string;
  rating: number;
  reviewsCount: number;
  price: number;
  thumbnailUrl: string;
  lessons: Lesson[];
  resources: Resource[];
  isPublished?: boolean;
}

export interface PdfProduct {
  id: string;
  title: string;
  description: string;
  price: number;
  thumbnailUrl: string;
  pdfUrl?: string; // only present for buyers
  previewUrl?: string;
  category?: string;
  isPublished?: boolean;
  createdAt?: string;
  hasAccess?: boolean;
}

export interface Order {
  id: string;
  userId: string;
  userEmail: string;
  courseId: string;
  courseTitle: string;
  productType?: "course" | "pdf";
  amount: number;
  paymentMethod: string;
  accountNumber: string;
  status: "pending" | "approved" | "refunded" | "rejected";
  createdAt: string;
}

export interface UserProgress {
  userId: string;
  courseId: string;
  completedLessons: string[];
  lastWatchedLessonId?: string;
  updatedAt: string;
}

export interface SessionLog {
  id: string;
  userId: string;
  userEmail: string;
  deviceId: string;
  browser: string;
  ip: string;
  location: string;
  loginTime: string;
  isActive: boolean;
}

export interface AdminStats {
  totalUsers: number;
  totalCourses: number;
  totalSales: number;
  totalRevenue: number;
}

export interface SuspiciousLogin {
  email: string;
  distinctDevices: number;
  details: {
    browser: string;
    ip: string;
    loginTime: string;
    location: string;
  }[];
}
