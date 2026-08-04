'use client';
import { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import StatCard from './StatCard';
import ListWidget from './ListWidget';

export default function EmployeesWidget({ permissions, data }: { permissions: string[]; data: any }) {
  const hasViewAll = permissions.includes('employees.view_all') || permissions.includes('hr.manage_all') || permissions.includes('hr.view_directory');
  const hasView = permissions.includes('employees.view');
  const totalEmployees = data?.hrStats?.totalEmployees;

  const widgets = [];

  if (hasViewAll && totalEmployees !== undefined) {
    widgets.push(
      <StatCard key="total-employees" label="Total Employees" value={totalEmployees} icon={Users} color="text-blue-600" bgColor="bg-blue-50" delay={0} />
    );
  }

  return <>{widgets}</>;
}
