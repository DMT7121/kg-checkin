import Swal from 'sweetalert2';

// Cập nhật cấu hình lên Github bằng Github REST API
export const updateGasUrlOnGithub = async (newUrl: string, githubPat: string) => {
  const repoOwner = 'DMT7121';
  const repoName = 'kg-checkin';
  const filePath = 'src/services/api.ts';
  const branch = 'main';

  try {
    // 1. Lấy thông tin file hiện tại từ Github (để lấy SHA bắt buộc cho việc Update)
    const getRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}?ref=${branch}`, {
      headers: {
        'Authorization': `token ${githubPat}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!getRes.ok) {
      if (getRes.status === 401 || getRes.status === 403) {
        throw new Error('Github Token không hợp lệ hoặc không có quyền truy cập.');
      }
      throw new Error(`Không thể đọc file từ Github: ${getRes.statusText}`);
    }

    const fileData = await getRes.json();
    const currentSha = fileData.sha;
    
    // Decode nội dung base64 (sử dụng atob, hỗ trợ unicode qua escape)
    const contentBase64 = fileData.content;
    const currentContent = decodeURIComponent(escape(atob(contentBase64)));

    // 2. Tìm và thay thế URL cũ bằng URL mới
    const urlRegex = /https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec/g;
    
    if (!urlRegex.test(currentContent)) {
      throw new Error('Không tìm thấy đường link GAS cũ trong mã nguồn để thay thế.');
    }

    const newContent = currentContent.replace(urlRegex, newUrl);

    // Encode nội dung mới sang base64
    const newContentBase64 = btoa(unescape(encodeURIComponent(newContent)));

    // 3. Ghi đè file lên Github
    const updateRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${githubPat}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Auto-update: Cập nhật GAS URL mới từ WebApp UI',
        content: newContentBase64,
        sha: currentSha,
        branch: branch
      })
    });

    if (!updateRes.ok) {
      throw new Error(`Cập nhật Github thất bại: ${updateRes.statusText}`);
    }

    return true;
  } catch (error: any) {
    console.error('Lỗi khi update Github:', error);
    Swal.fire('Lỗi Github API', error.message || 'Đã xảy ra lỗi không xác định', 'error');
    return false;
  }
};

export const triggerDeveloperMode = async () => {
  const currentLocalUrl = localStorage.getItem('kg_gas_url') || '';
  
  const { value: formValues } = await Swal.fire({
    title: '🔧 Developer Mode',
    html: `
      <div class="text-left space-y-4">
        <div>
          <label class="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">GAS API URL Mới:</label>
          <input id="swal-input-url" class="swal2-input w-full mx-0 text-sm" value="${currentLocalUrl}" placeholder="https://script.google.com/macros/s/.../exec">
        </div>
        <div class="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-100 dark:border-blue-800">
          <label class="flex items-start space-x-2 cursor-pointer">
            <input type="checkbox" id="swal-input-global" class="mt-1 rounded text-ocean-600 focus:ring-ocean-500">
            <span class="text-sm text-gray-700 dark:text-gray-300">
              <strong>Cập nhật toàn hệ thống (Global)</strong><br/>
              <span class="text-xs text-gray-500">Tự động sửa code trên Github và kích hoạt Cloudflare Deploy cho tất cả mọi người.</span>
            </span>
          </label>
        </div>
        <div id="pat-container" class="hidden">
          <label class="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">Github PAT (Bảo mật):</label>
          <input id="swal-input-pat" type="password" class="swal2-input w-full mx-0 text-sm" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx">
          <p class="text-xs text-gray-500 mt-1">Mã Token này chỉ dùng 1 lần, không lưu lại trên máy chủ.</p>
        </div>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Cập nhật',
    cancelButtonText: 'Hủy',
    didOpen: () => {
      const checkbox = document.getElementById('swal-input-global') as HTMLInputElement;
      const patContainer = document.getElementById('pat-container') as HTMLDivElement;
      checkbox.addEventListener('change', (e) => {
        if ((e.target as HTMLInputElement).checked) {
          patContainer.classList.remove('hidden');
        } else {
          patContainer.classList.add('hidden');
        }
      });
    },
    preConfirm: () => {
      const url = (document.getElementById('swal-input-url') as HTMLInputElement).value.trim();
      const isGlobal = (document.getElementById('swal-input-global') as HTMLInputElement).checked;
      const pat = (document.getElementById('swal-input-pat') as HTMLInputElement).value.trim();
      
      if (!url && !isGlobal) return { url: '', isGlobal: false, pat: '' }; // Allow clearing local override
      if (!url) {
        Swal.showValidationMessage('Vui lòng nhập URL!');
        return false;
      }
      if (isGlobal && !pat) {
        Swal.showValidationMessage('Cập nhật Global cần có Github PAT!');
        return false;
      }
      return { url, isGlobal, pat };
    }
  });

  if (formValues) {
    if (formValues.isGlobal) {
      // Global Update
      Swal.fire({
        title: 'Đang đẩy code lên Github...',
        text: 'Vui lòng không tắt trình duyệt',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });
      
      const success = await updateGasUrlOnGithub(formValues.url, formValues.pat);
      if (success) {
        Swal.fire(
          'Thành công!', 
          'Code đã được cập nhật lên Github. Cloudflare sẽ tự động Deploy phiên bản mới trong khoảng 2-3 phút tới.', 
          'success'
        );
      }
    } else {
      // Local Override
      if (formValues.url) {
        localStorage.setItem('kg_gas_url', formValues.url);
        Swal.fire('Thành công', 'Đã ghi đè GAS URL cho máy này. Đang tải lại trang...', 'success').then(() => window.location.reload());
      } else {
        localStorage.removeItem('kg_gas_url');
        Swal.fire('Thành công', 'Đã khôi phục URL mặc định cho máy này. Đang tải lại trang...', 'success').then(() => window.location.reload());
      }
    }
  }
};
