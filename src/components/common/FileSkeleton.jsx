import React from 'react';

export default function FileSkeleton({ count = 8, type = 'table' }) {
    // 1. Home Section Skeleton
    if (type === 'home-section') {
        return (
            <div className="space-y-2 animate-pulse py-2">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5 px-3 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-3 flex-1">
                            <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded shrink-0" />
                            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                        </div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20 hidden md:block" />
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24 hidden sm:block" />
                        <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded-full shrink-0" />
                    </div>
                ))}
            </div>
        );
    }

    // 2. Grid Mode Skeleton (For FileGridView)
    if (type === 'grid') {
        return (
            <div className="w-full animate-pulse space-y-6">
                {/* Folders Grid Skeleton */}
                <div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-28 mb-3" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="p-3.5 rounded-2xl bg-gray-100/80 dark:bg-white/10 border border-gray-200/60 dark:border-gray-700/60 flex items-center gap-3">
                                <div className="w-9 h-9 bg-gray-200 dark:bg-gray-700 rounded-xl shrink-0" />
                                <div className="flex-1 space-y-1.5 min-w-0">
                                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Files Grid Skeleton */}
                <div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-3" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {[...Array(count)].map((_, i) => (
                            <div key={i} className="p-3.5 rounded-2xl bg-gray-100/80 dark:bg-white/10 border border-gray-200/60 dark:border-gray-700/60 flex flex-col justify-between h-52">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded shrink-0" />
                                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded flex-1 ml-2" />
                                    <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded-full shrink-0" />
                                </div>
                                <div className="w-full h-24 bg-gray-200 dark:bg-gray-700 rounded-xl my-2" />
                                <div className="flex justify-between items-center pt-1 border-t border-gray-200/60 dark:border-gray-700/60">
                                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-12" />
                                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-14" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // 3. Extended Metadata Table / List Mode Skeleton (For FileListView)
    return (
        <div className="w-full overflow-hidden animate-pulse rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-[#282a2c]">
            {/* Table Header Skeleton */}
            <div className="grid grid-cols-12 items-center border-b border-gray-200 dark:border-gray-700 py-3 px-3 bg-gray-50/80 dark:bg-white/5 text-xs">
                <div className="col-span-3 flex items-center gap-2">
                    <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded shrink-0" />
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24" />
                </div>
                <div className="col-span-1 h-4 bg-gray-200 dark:bg-gray-700 rounded w-12" />
                <div className="col-span-2 h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />
                <div className="col-span-1 h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                <div className="col-span-1 h-4 bg-gray-200 dark:bg-gray-700 rounded w-14" />
                <div className="col-span-1 h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                <div className="col-span-1 h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />
                <div className="col-span-1 flex justify-end">
                    <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded-full" />
                </div>
            </div>

            {/* Table Rows Skeleton */}
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {[...Array(count)].map((_, i) => (
                    <div key={i} className="grid grid-cols-12 items-center py-3 px-3">
                        <div className="col-span-3 flex items-center gap-3">
                            <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded shrink-0" />
                            <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded shrink-0" />
                            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                        </div>
                        <div className="col-span-1 h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-14" />
                        <div className="col-span-2 h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-24" />
                        <div className="col-span-1 h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-12" />
                        <div className="col-span-1 h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-14" />
                        <div className="col-span-1 h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                        <div className="col-span-1 h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-20" />
                        <div className="col-span-1 flex justify-end">
                            <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded-full" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
